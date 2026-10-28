import { test as base, expect, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

export const test = base.extend<{ fake: FakeSupabase }>({
  // auto: true -> installed for EVERY test, even ones that never mention `fake`.
  // Without it a test that only uses `page` would talk to the real Supabase and hang on "Loading...".
  fake: [async ({ page }, use) => {
    const fake = new FakeSupabase();
    await fake.install(page);
    await use(fake);
  }, { auto: true }],
});
export { expect };

/** Sign in through the real login form. */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/index.html');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Set a date input and fire exactly one `change` event (what the app listens for). */
export async function setDate(page: Page, selector: string, value: string) {
  await page.locator(selector).evaluate((el, v) => {
    (el as HTMLInputElement).value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

export const slot = (page: Page, time: string) => page.locator('#book-slots .slot', { hasText: new RegExp(`^${time}$`) });
