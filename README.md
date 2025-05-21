# Backend for Förderscouting-Plattform

This repository contains the backend for the **Förderscouting-Plattform** project, built using **Strapi** (version 4.21.0).

## Features
- **API Endpoints**: Manage and expose data to the frontend.
- **Authentication**: Provides secure authentication methods.
- **Admin Panel**: Customizable admin panel for managing content.

## Installation and Setup

### Prerequisites:
- Node.js (>=18.x)
- Yarn (recommended) or NPM

### Steps to Install:
1. **Clone the repository**:
    ```bash
    git clone https://github.com/AlameenAzad/amtviol-api.git
    ```
2. **Navigate to the project directory**:
    ```bash
    cd amtviol-api
    ```
3. **Install dependencies**:
    ```bash
    yarn install
    # or
    npm install
    ```

4. **Run the application**:
    ```bash
    yarn develop
    # or
    npm run develop
    ```

5. Visit the **Strapi Admin Panel** at `http://localhost:1337/admin`.

## Environment Variables

The backend for **Förderscouting-Plattform** uses various environment variables to configure the application. You should set these values in a `.env` file at the root of your project. Below is an explanation of each environment variable:

### List of Environment Variables:

- **`HOST`**  
  The host on which the application will run. Setting this to `0.0.0.0` allows the server to accept connections from all network interfaces.

- **`PORT`**  
  The port on which the application will listen. By default, Strapi runs on port `1337`.

- **`APP_KEYS`**  
  A comma-separated list of application keys used for signing cookies, session tokens, etc. These keys are critical for securing your application.

- **`JWT_SECRET`**  
  The secret key used to sign JSON Web Tokens (JWTs). Ensure this is kept secret and secure.

- **`API_TOKEN_SALT`**  
  Salt used to hash API tokens. It is used to secure API tokens for authentication.

- **`DATABASE_PASSWORD`**  
  The password for your database user. Ensure this is strong and kept secure.

- **`DATABASE_HOST`**  
  The host where your database is running. By default, this is set to `localhost` for a local setup.

- **`DATABASE_USERNAME`**  
  The username to connect to the database.

- **`BACKEND_URL_LOCAL`**  
  The URL for the backend. This is used in various places, like resetting passwords or sending notifications.

- **`RESET_PWD_PAGE`**  
  The URL for the password reset page. This link will be sent to users when they request to reset their password.

- **`SENTRY_DSN`**  
  The DSN (Data Source Name) for integrating **Sentry** for error tracking. Replace this with your own Sentry DSN.

- **`TRANSFER_TOKEN_SALT`**  
  A salt used to secure transfer tokens.

- **`EMAIL_AUTH`**  
  The email address used to authenticate with the SMTP server when sending emails.

- **`EMAIL_PASS`**  
  The password for the email account used to authenticate with the SMTP server.

- **`SMTP_HOST`**  
  The SMTP server's host used for sending emails.

- **`SMTP_PORT`**  
  The port used for the SMTP server. The default port is `2525` for secure email delivery.

- **`DEF_FROM`**  
  The default email address used as the "From" address when sending emails.

- **`DEF_REPLYTO`**  
  The default email address for replies when emails are sent.

---

Please ensure these environment variables are correctly configured before running the application to ensure everything works smoothly.

## Deployment

For deployment instructions, refer to the relevant platform documentation.

## Contributing
We welcome contributions! Please see the [CONTRIBUTING.md](./CONTRIBUTING.md) for more information.

## License
This project is licensed under the GNU Affero General Public License v3.0. See the [LICENSE](./LICENSE) for more details.
