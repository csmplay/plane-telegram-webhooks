# plane-telegram-webhooks

Forwards Plane webhook events to Telegram.

## Setup

Copy `.env.example` to `.env` and fill in the values.

```sh
npm i
npm start
```

Or with Docker:

```sh
docker build -t plane-telegram-webhooks .
docker run -d --env-file .env -p 3111:3111 \
  -v ./config:/usr/src/app/config \
  -v ./data:/usr/src/app/data \
  plane-telegram-webhooks
```

## Config files

Put these in `config/` (gitignored).

`users.json` maps Plane display names to Telegram user IDs for mentions:

```json
{
  "John": "123456789"
}
```

`template.js` overrides the default message template. Only set what you want to change. See `app/template.js` for defaults.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
