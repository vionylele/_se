#!/usr/bin/env python3
"""
PyCurl-Lite
===========
A lightweight, curl-inspired command-line HTTP client written in pure Python.

Author: Claude (Anthropic)

This tool is NOT a wrapper around the `pycurl` library. It is an independent
implementation built on top of the `requests` library, meant to mimic the
most commonly used features of the real `curl` command.

Usage examples:
    python pycurl_lite.py https://example.com
    python pycurl_lite.py -X POST -d '{"name":"claude"}' -H "Content-Type: application/json" https://httpbin.org/post
    python pycurl_lite.py -I https://example.com
    python pycurl_lite.py -o output.html https://example.com
    python pycurl_lite.py -L -v https://httpbin.org/redirect/2
"""

import argparse
import sys
import time
import os

try:
    import requests
except ImportError:
    print("Error: this tool requires the 'requests' package.", file=sys.stderr)
    print("Install it with: pip install requests", file=sys.stderr)
    sys.exit(1)


def parse_headers(header_list):
    """Convert a list of 'Key: Value' strings into a dict."""
    headers = {}
    for h in header_list or []:
        if ":" not in h:
            print(f"Warning: ignoring malformed header '{h}'", file=sys.stderr)
            continue
        key, value = h.split(":", 1)
        headers[key.strip()] = value.strip()
    return headers


def parse_cookies(cookie_str):
    """Convert 'a=1; b=2' into a dict."""
    cookies = {}
    if not cookie_str:
        return cookies
    for pair in cookie_str.split(";"):
        pair = pair.strip()
        if "=" in pair:
            k, v = pair.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def build_parser():
    parser = argparse.ArgumentParser(
        prog="pycurl_lite.py",
        description="A curl-like command-line HTTP client written in Python.",
        add_help=True,
    )
    parser.add_argument("url", help="The URL to request")
    parser.add_argument("-X", "--request", default=None,
                         help="HTTP method to use (GET, POST, PUT, DELETE, PATCH, ...)")
    parser.add_argument("-H", "--header", action="append", default=[],
                         help="Extra header, e.g. -H 'Content-Type: application/json' (repeatable)")
    parser.add_argument("-d", "--data", default=None,
                         help="Send data in the request body (implies POST unless -X is set)")
    parser.add_argument("-F", "--form", action="append", default=[],
                         help="Multipart form field as key=value (repeatable)")
    parser.add_argument("-o", "--output", default=None,
                         help="Write response body to a file instead of stdout")
    parser.add_argument("-O", "--remote-name", action="store_true",
                         help="Save response body using the URL's file name")
    parser.add_argument("-I", "--head", action="store_true",
                         help="Fetch headers only (HTTP HEAD request)")
    parser.add_argument("-i", "--include", action="store_true",
                         help="Include response headers in the output")
    parser.add_argument("-L", "--location", action="store_true",
                         help="Follow redirects (3xx responses)")
    parser.add_argument("-u", "--user", default=None,
                         help="Basic auth credentials as user:password")
    parser.add_argument("-A", "--user-agent", default="PyCurl-Lite/1.0",
                         help="Set the User-Agent header")
    parser.add_argument("-b", "--cookie", default=None,
                         help="Send cookies as 'name1=value1; name2=value2'")
    parser.add_argument("-k", "--insecure", action="store_true",
                         help="Skip SSL certificate verification")
    parser.add_argument("-s", "--silent", action="store_true",
                         help="Suppress progress/status messages")
    parser.add_argument("-v", "--verbose", action="store_true",
                         help="Print request/response details (like curl -v)")
    parser.add_argument("--connect-timeout", type=float, default=10.0,
                         help="Connection timeout in seconds (default: 10)")
    parser.add_argument("--max-time", type=float, default=None,
                         help="Maximum total time allowed for the request, in seconds")
    return parser


def main():
    args = build_parser().parse_args()

    method = args.request
    if method is None:
        method = "HEAD" if args.head else ("POST" if (args.data or args.form) else "GET")
    method = method.upper()

    headers = parse_headers(args.header)
    headers.setdefault("User-Agent", args.user_agent)

    cookies = parse_cookies(args.cookie)

    auth = None
    if args.user:
        if ":" in args.user:
            u, p = args.user.split(":", 1)
        else:
            u, p = args.user, ""
        auth = (u, p)

    files = None
    data = args.data
    if args.form:
        files = {}
        for field in args.form:
            if "=" not in field:
                print(f"Warning: ignoring malformed form field '{field}'", file=sys.stderr)
                continue
            k, v = field.split("=", 1)
            files[k] = (None, v)

    if args.verbose and not args.silent:
        print(f"> {method} {args.url}", file=sys.stderr)
        for k, v in headers.items():
            print(f"> {k}: {v}", file=sys.stderr)
        if data:
            print(f"> [body: {data}]", file=sys.stderr)
        print(">", file=sys.stderr)

    start = time.time()
    try:
        response = requests.request(
            method=method,
            url=args.url,
            headers=headers,
            data=data,
            files=files,
            cookies=cookies,
            auth=auth,
            allow_redirects=args.location,
            verify=not args.insecure,
            timeout=(args.connect_timeout, args.max_time),
        )
    except requests.exceptions.RequestException as e:
        print(f"pycurl_lite: request failed: {e}", file=sys.stderr)
        sys.exit(1)
    elapsed = time.time() - start

    if args.verbose and not args.silent:
        print(f"< HTTP {response.status_code} {response.reason}", file=sys.stderr)
        for k, v in response.headers.items():
            print(f"< {k}: {v}", file=sys.stderr)
        print(f"< [completed in {elapsed:.3f}s]", file=sys.stderr)
        print("<", file=sys.stderr)

    # Build the text that represents "output" (headers + body as curl would show it)
    output_parts = []
    if args.include or args.head:
        status_line = f"HTTP/{response.raw.version / 10:.1f} {response.status_code} {response.reason}"
        output_parts.append(status_line)
        for k, v in response.headers.items():
            output_parts.append(f"{k}: {v}")
        output_parts.append("")  # blank line between headers and body

    body_text = "" if args.head else response.text
    if body_text:
        output_parts.append(body_text)

    final_output = "\n".join(output_parts)

    # Decide destination file, if any
    dest_file = args.output
    if args.remote_name and not dest_file:
        name = os.path.basename(args.url.split("?")[0])
        dest_file = name if name else "index.html"

    if dest_file:
        mode = "w" if not args.head else "w"
        with open(dest_file, mode, encoding="utf-8", errors="replace") as f:
            f.write(final_output)
        if not args.silent:
            print(f"Saved {len(final_output)} bytes to {dest_file}", file=sys.stderr)
    else:
        print(final_output)

    sys.exit(0 if response.ok else 1)


if __name__ == "__main__":
    main()
