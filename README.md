<div align="center">

# EPlusTV — FOX One Direct Login (Experimental)

**Test branch:** `foxone-profile-login`  
**Current tested build:** `1eb5e4d`

> ⚠️ **Experimental build for testers.** This fork adds direct FOX One email/password authentication to EPlusTV. It has been tested with an authorized FOX One account, but it is not yet presented as a stable upstream release.

</div>

## Quick start for testers

If you want to try the FOX One direct-login work, use the **`foxone-profile-login` branch**. The default `master` branch does not contain the experimental login path.

### Requirements

- Docker Engine with Docker Compose support, or Portainer with Docker Compose/Stacks support
- An **authorized FOX One account** that you are permitted to use
- Port 8000 available on the host, or a different host port mapped to container port 8000

### Docker Compose

From a clone of this repository:

```bash
git clone -b foxone-profile-login https://github.com/Nostradamus1973/EPlusTV-FoxOne-Login.git
cd EPlusTV-FoxOne-Login
docker compose up -d --build
```

Then open:

`http://<host-ip>:8000`

The application persists its configuration in `/opt/eplustv/config` when using the included Compose file.

### Portainer

Create a new **Stack** in Portainer and deploy the repository's `foxone-profile-login` branch using the included `compose.yaml`.

Alternatively, if the image has already been built locally, a stack can use:

```yaml
services:
  eplustv:
    image: eplustv:foxone-profile-login
    container_name: eplustv
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - /opt/eplustv/config:/app/config
```

> **Note for nested/LXC Docker hosts:** some hosts require `security_opt: [apparmor=unconfined]` because the Docker daemon cannot load its default AppArmor profile from inside the LXC. That is an environment-specific workaround, not a general requirement for EplusTV.

### FOX One login

The FOX One provider keeps the existing TV/device-code authentication path and adds an experimental **direct email/password** login option.

Use your own authorized FOX One credentials. Credentials are entered through the EplusTV web UI and are not intended to be placed in the repository, README, Docker image, or source code.

The direct login flow:

1. Sends the supplied credentials to the FOX One Profile API login flow.
2. Generates a local device UUID for the login request.
3. Validates the returned Profile access token against the FOX One DTC entitlement service.
4. Enables the provider only when that compatibility check succeeds.
5. Reuses the accepted token for entitlement, event, and playback requests.

**Do not open an issue or pull request containing passwords, access tokens, refresh tokens, cookies, or other account secrets.**

## Reporting problems

When reporting a problem, include:

- EplusTV version/commit
- Whether you used direct login or the existing TV/device-code flow
- Docker/Portainer version
- Relevant error messages or sanitized logs
- The provider/channel/event involved

Remove credentials and authentication tokens before posting logs.

---

# About
This takes programming from various providers and transforms it into a "live TV" experience with virtual linear channels. It will discover what is on, and generate a schedule of channels that will give you M3U and XMLTV files that you can import into something like [Jellyfin](https://jellyfin.org) or [Channels](https://getchannels.com).

## Notes
* This was not made for pirating streams. This is made for using your own credentials and have a different presentation than the streaming apps currently provide.
* Providers might not like it and it could be taken down at any minute. Enjoy it while it lasts. ¯\\_(ツ)_/¯

# Using
The server exposes 4 main endpoints:

| Endpoint | Description |
|---|---|
| /channels.m3u | The channel list you'll import into your client |
| /xmltv.xml | The schedule that you'll import into your client |
| /linear-channels.m3u | The linear channel list you'll import into your client (only used when using the dedicated linear channels option) |
| /linear-xmltv.xml | The linear schedule that you'll import into your client (only used when using the dedicated linear channels option) - Not needed for Channels DVR |

## Running

The recommended way to run this fork is with Docker Compose from the repository.


This fork includes an experimental direct FOX One email/password login path based on the Profile API client flow documented in the companion research repository.

The existing TV/device-code authentication path remains available. Direct login:

- sends the user's credentials to the documented FOX One Profile API login endpoint;
- generates a local device UUID for the login request;
- stores authentication state only in EplusTV's existing local provider database;
- tests whether the returned Profile access token is accepted by the existing FOX One DTC entitlement service before enabling the provider;
- reuses the returned token for entitlement/event/playback requests when that compatibility test succeeds.

No API key, password, access token, refresh token, or other live credential is committed to Git.

The direct login path is intentionally experimental until it has been tested against an authorized FOX One account.
## FOX One direct login research

This fork includes an experimental direct FOX One email/password login path based on the researched Profile API client flow.

The existing TV/device-code authentication path remains available. Direct login:

- sends the user's credentials to the FOX One Profile API login endpoint;
- generates a local device UUID for the login request;
- stores authentication state only in EplusTV's existing local provider database;
- tests whether the returned Profile access token is accepted by the existing FOX One DTC entitlement service before enabling the provider;
- reuses the returned token for entitlement/event/playback requests when that compatibility test succeeds.

No API key, password, access token, refresh token, or other live credential is committed to Git.

The direct login path is experimental and should be treated as a tester build until it is incorporated into a stable release.
