<!-- SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru> -->
<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->

# plane-telegram-webhooks

Forwards Plane webhook events to Telegram.

## Setup

Copy `.env.example` to `.env` and fill in the values.

```sh
yarn install
yarn start
```


## Docker

You can run the app using the prebuilt image:


```sh
docker pull git.csmpro.ru/csmpro/plane-telegram-webhooks:latest
docker run --env-file .env -v $(pwd)/data:/app/data -p 3111:3111 git.csmpro.ru/csmpro/plane-telegram-webhooks:latest
```

Or use [docker-compose file](docker-compose.yml).

## Config files

Put these in `config/` (gitignored).

`users.json` maps Plane user IDs to Telegram user IDs for mentions:

```json
{
  "a8d4c6f1-2b7e-4c90-b3a1-6f2e9d5c8b14": "393340286"
}
```

`template.json` overrides the default message template. Only set what you want to change. See `app/template.js` for defaults.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
