# PyCurl-Lite

A lightweight, `curl`-inspired command-line HTTP client written entirely in Python.

**Created by:** Claude (Anthropic)

> Note: this project is an independent implementation and is **not** related to the third-party `pycurl` Python library. It is built on top of [`requests`](https://pypi.org/project/requests/) to replicate the most common workflows of the real `curl` command.

---

## Features

- `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, and any custom HTTP method via `-X`
- Custom headers via `-H` (repeatable)
- Send raw/JSON body data via `-d`
- Send multipart form fields via `-F`
- Save response to a file with `-o` or `-O` (remote file name)
- Headers-only request with `-I`
- Include response headers in output with `-i`
- Follow redirects with `-L`
- HTTP Basic Auth with `-u user:password`
- Custom `User-Agent` with `-A`
- Send cookies with `-b`
- Skip SSL verification with `-k` (useful for self-signed certs)
- Verbose request/response trace with `-v` (like `curl -v`)
- Silent mode with `-s`
- Connection/total timeouts

## Requirements

- Python 3.7+
- `requests` library

## Installation

```bash
git clone <this-project>
cd pycurl-lite
pip install -r requirements.txt 
python -m pip install -r requirements.txt (if pip install -r requirements.txt error)
```

## Usage

```bash
python pycurl_lite.py [OPTIONS] URL
```

### Examples

Simple GET request:
```bash
python pycurl_lite.py https://example.com
```

POST JSON data:
```bash
python pycurl_lite.py -X POST \
  -H "Content-Type: application/json" \
  -d '{"name": "claude"}' \
  https://httpbin.org/post
```

Fetch headers only:
```bash
python pycurl_lite.py -I https://example.com
```

Download a file, saving it under the remote file name:
```bash
python pycurl_lite.py -O https://example.com/file.zip
```

Follow redirects and print verbose request/response info:
```bash
python pycurl_lite.py -L -v https://httpbin.org/redirect/2
```

Send Basic Auth credentials:
```bash
python pycurl_lite.py -u myuser:mypassword https://httpbin.org/basic-auth/myuser/mypassword
```

Skip SSL verification (self-signed certificates):
```bash
python pycurl_lite.py -k https://self-signed.example.com
```

## Project structure

```
pycurl-lite/
├── pycurl_lite.py     # main CLI script
├── requirements.txt   # dependencies
└── README.md          # this file
```

## Limitations

This is an educational/lightweight tool, not a full `curl` reimplementation. It does not support:
- HTTP/2 or HTTP/3
- FTP, SCP, or other non-HTTP(S) protocols
- Progress bars during transfer
- `.netrc` file parsing
- Advanced TLS options (client certificates, cipher selection, etc.)

## License

This project is provided as-is for educational and practical use. Feel free to modify and extend it.

---
---S