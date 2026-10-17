import {FC} from 'hono/jsx';

import {foxOneHandler} from '@/services/foxone-handler';

interface ILogin {
  code?: string;
  message?: string;
}

export const Login: FC<ILogin> = async ({code, message}) => {
  let shownCode = code;

  if (!shownCode) {
    shownCode = await foxOneHandler.getAuthCode();
  }

  return (
    <div>
      {message && <article>{message}</article>}
      <div hx-target="this" hx-swap="outerHTML" hx-trigger="every 5s" hx-get={`/providers/foxone/tve-login/${shownCode}`}>
        <div class="grid-container">
          <div>
            <h5>FOX One TV Login</h5>
            <span>
              Open this link and follow instructions:
              <br />
              <a href="https://go.fox.com" target="_blank">https://go.fox.com</a>
            </span>
            <h6>Code: {shownCode}</h6>
          </div>
          <div aria-busy="true" style="align-content: center" />
        </div>
      </div>

      <hr />

      <div class="grid-container">
        <div>
          <h5>FOX One Direct Login (experimental)</h5>
          <p>Uses the Profile API email/password flow discovered in the FOX One Android client. Credentials are sent directly to FOX and are not stored by the form.</p>
          <form hx-post="/providers/foxone/profile-login" hx-target="this" hx-swap="outerHTML">
            <label>Email<input type="email" name="email" required /></label>
            <label>Password<input type="password" name="password" required /></label>
            <button type="submit">Sign in with FOX One</button>
          </form>
        </div>
      </div>
    </div>
  );
};
