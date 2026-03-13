# plane-telegram-webhooks

Forwards Plane webhook events to Telegram.

## Setup

Copy `.env.example` to `.env` and fill in the values.

```sh
npm i
npm start
```


## Docker

You can run the app using the prebuilt image:


```sh
docker pull git.csmpro.ru/csmpro/plane-telegram-webhooks:latest
docker run --env-file .env -v $(pwd)/data:/app/data -p 1488:1488 git.csmpro.ru/csmpro/plane-telegram-webhooks:latest
```

Or use [docker-compose file](docker-compose.yml).

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

AGPL-3.0-only. See [LICENSE](LICENSE).
