/**
 * END-TO-END TESTS (Playwright) - run against the unmodified homework/03/Clinic_System app,
 * served locally by playwright.config.ts. Backend responses come from support/fake-supabase.ts.
 */
import { ADMIN, PATIENT, taipeiDate } from './support/fake-supabase';
import { expect, login, setDate, slot, test } from './support/fixtures';

const BREAK_SLOTS = /^(12:00|12:30|13:00|17:00|17:30)$/;

test.describe('Scenario A - Patient booking journey', () => {
  test('patient logs in, books an eligible slot and sees it under Upcoming', async ({ page, fake }) => {
    const tomorrow = taipeiDate(1);
    const complaint = 'Sore throat and mild fever for two days';

    await login(page, PATIENT.email, PATIENT.password);

    // Patient role: patient navigation only, no admin menu
    await expect(page.getByRole('button', { name: /Book Appointment/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Master Schedule/ })).toHaveCount(0);

    await page.getByRole('button', { name: /Book Appointment/ }).click();
    await page.locator('#b-dept').selectOption('General Medicine');
    await setDate(page, '#b-date', tomorrow);

    // 21 slots rendered; no break-hour slot exists at all
    await expect(page.locator('#book-slots .slot')).toHaveCount(21);
    await expect(page.locator('#book-slots .slot', { hasText: BREAK_SLOTS })).toHaveCount(0);
    // 10:00 is already booked by another patient -> disabled
    await expect(slot(page, '10:00')).toBeDisabled();

    await slot(page, '09:00').click();
    await expect(slot(page, '09:00')).toHaveClass(/selected/);

    await page.locator('#b-cc').fill(complaint);
    await page.locator('#b-notes').fill('None');
    await page.getByRole('button', { name: /Confirm booking/ }).click();

    await expect(page.getByText('Appointment booked successfully.')).toBeVisible();

    // Lands on "My Appointments" with the Upcoming tab (2 seeded + the new one)
    await expect(page.getByRole('button', { name: /^Upcoming/ })).toContainText('(3)');
    const card = page.locator('.card', { hasText: complaint });
    await expect(card).toContainText('at 09:00');
    await expect(card).toContainText('General Medicine');
    await expect(card.locator('.badge')).toHaveText('Scheduled');

    // What actually went over the wire
    const [post] = fake.postsTo('appointments');
    expect(post.body).toMatchObject({
      patient_id: PATIENT.id, appointment_date: tomorrow, appointment_time: '09:00',
      department: 'General Medicine', chief_complaint: complaint, status: 'Scheduled',
    });
  });

  test('cannot submit without choosing a time slot', async ({ page, fake }) => {
    await login(page, PATIENT.email, PATIENT.password);
    await page.locator('#b-dept').selectOption('ENT');
    await setDate(page, '#b-date', taipeiDate(2));
    await page.locator('#b-cc').fill('Ear pain');
    await page.locator('#b-notes').fill('None');
    await page.getByRole('button', { name: /Confirm booking/ }).click();
    await expect(page.getByText('Please select a time slot.')).toBeVisible();
    expect(fake.postsTo('appointments')).toHaveLength(0);
  });

  test('invalid credentials show an error and stay on the login page', async ({ page }) => {
    await login(page, PATIENT.email, 'wrong-password');
    await expect(page.getByText('Invalid login credentials')).toBeVisible();
    await expect(page.locator('form[data-form="auth"]')).toBeVisible();
  });
});

test.describe('Scenario B - 1-hour rule enforced in the UI', () => {
  /** Freeze the browser clock at HH:MM Asia/Taipei today, before the app loads. */
  const freeze = (page: import('@playwright/test').Page, hhmm: string) =>
    page.clock.setFixedTime(new Date(`${taipeiDate(0)}T${hhmm}:00+08:00`));

  async function openTodayPicker(page: import('@playwright/test').Page) {
    await login(page, PATIENT.email, PATIENT.password);
    await page.locator('#b-dept').selectOption('Family Medicine');
    await setDate(page, '#b-date', taipeiDate(0));
    await expect(page.locator('#book-slots .slot')).toHaveCount(21);
  }

  test('at 10:31 every slot within the next hour (incl. 11:30 = 59 min) is disabled', async ({ page }) => {
    await freeze(page, '10:31');
    await openTodayPicker(page);

    for (const t of ['08:00', '10:00', '10:30', '11:00', '11:30']) await expect(slot(page, t)).toBeDisabled();
    await expect(slot(page, '13:30')).toBeEnabled();
    await expect(slot(page, '20:30')).toBeEnabled();
  });

  test('at 10:30 the slot exactly 60 minutes away (11:30) becomes available', async ({ page }) => {
    await freeze(page, '10:30');
    await openTodayPicker(page);

    await expect(slot(page, '11:00')).toBeDisabled();
    await expect(slot(page, '11:30')).toBeEnabled();
  });

  test('tomorrow is fully bookable regardless of the current time', async ({ page }) => {
    await freeze(page, '19:45');
    await login(page, PATIENT.email, PATIENT.password);
    await page.locator('#b-dept').selectOption('Family Medicine');
    await setDate(page, '#b-date', taipeiDate(1));
    await expect(page.locator('#book-slots .slot:enabled')).toHaveCount(21);
  });

  test('defence in depth: forcing a disabled slot is rejected with an error and nothing is sent', async ({ page, fake }) => {
    await freeze(page, '10:31');
    await openTodayPicker(page);

    // Tamper with the DOM: re-enable the 11:00 button and pick it
    await slot(page, '11:00').evaluate((el) => el.removeAttribute('disabled'));
    await slot(page, '11:00').click();
    await page.locator('#b-cc').fill('Trying to beat the 1-hour rule');
    await page.locator('#b-notes').fill('None');
    await page.getByRole('button', { name: /Confirm booking/ }).click();

    await expect(page.getByText(/at least 1 hour before the appointment time/)).toBeVisible();
    expect(fake.postsTo('appointments')).toHaveLength(0);
    await expect(page.locator('form[data-form="book"]')).toBeVisible(); // still on the booking form
  });
});

test.describe('Scenario C - Admin queue & cancellation', () => {
  test('admin sees the master schedule newest-first and cancels with a mandatory reason', async ({ page, fake }) => {
    const reason = 'Doctor unavailable - clinic closed for training';
    await login(page, ADMIN.email, ADMIN.password);

    // Admin landing + role badge
    await expect(page.getByRole('button', { name: /Master Schedule/ })).toBeVisible();
    await expect(page.locator('header .badge')).toHaveText('Admin');
    await expect(page.getByRole('button', { name: /Book Appointment/ })).toHaveCount(0);

    await page.getByRole('button', { name: /Master Schedule/ }).click();

    // Sorted newest first
    const rows = page.locator('#sched-body tbody tr');
    await expect(rows).toHaveCount(5);
    const dates = (await rows.locator('td:first-child').allInnerTexts()).map((t) => t.split('\n')[0].trim());
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates[0]).toBe(taipeiDate(5));
    expect(dates[dates.length - 1]).toBe(taipeiDate(-3));

    // Open the cancel dialog for the ENT appointment
    const row = rows.filter({ hasText: 'Seed: ear pain' });
    await expect(row.locator('.badge')).toHaveText('Scheduled');
    await row.getByRole('button', { name: 'Cancel', exact: true }).click();
    const dialog = page.locator('#modal-root');
    await expect(dialog.getByRole('heading', { name: 'Cancel appointment' })).toBeVisible();

    // Mandatory reason: empty submit is blocked, nothing is sent
    await dialog.getByRole('button', { name: 'Cancel appointment' }).click();
    await expect(page.locator('#c-reason:invalid')).toHaveCount(1);
    await expect(dialog.getByRole('heading', { name: 'Cancel appointment' })).toBeVisible();
    expect(fake.patchesTo('appointments')).toHaveLength(0);

    // Provide the reason and confirm
    await page.locator('#c-reason').fill(reason);
    await dialog.getByRole('button', { name: 'Cancel appointment' }).click();

    await expect(page.getByText('Appointment cancelled.')).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Cancel appointment' })).toHaveCount(0);

    // Status badge flips to "Cancelled", reason is displayed, Cancel/Completed actions are gone
    const updated = rows.filter({ hasText: 'Seed: ear pain' });
    await expect(updated.locator('.badge')).toHaveText('Cancelled');
    await expect(updated).toContainText(reason);
    await expect(updated.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    await expect(updated.getByRole('button', { name: 'Completed', exact: true })).toHaveCount(0);
    await expect(updated.getByRole('button', { name: /Change status/ })).toBeVisible(); // admin can still correct the status

    const [patch] = fake.patchesTo('appointments');
    expect(patch.search).toContain('id=eq.a2');
    expect(patch.body).toMatchObject({ status: 'Cancelled', cancellation_reason: reason, cancelled_by: 'admin' });
  });

  test('admin can filter the master schedule by status', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.getByRole('button', { name: /Master Schedule/ }).click();
    await page.locator('select[data-filter="status"]').selectOption('Completed');
    await expect(page.locator('#sched-body tbody tr')).toHaveCount(1);
    await expect(page.locator('#sched-body tbody tr .badge')).toHaveText('Completed');
  });
});
