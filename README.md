<div align="center">

# EPlusTV — FOX One Direct Login (Experimental)

**Test branch:** `foxone-profile-login`  
**Current tested build:** `1eb5e4d`

> ⚠️ **Experimental build for testers.** This fork adds direct FOX One email/password authentication to EplusTV. It has been tested with an authorized FOX One account, but it is not yet presented as a stable upstream release.

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

Create a new **Stack** in Portainer and deploy the repository's `foxone-profile-login` branch using the included `compose.yaml` on a normal Docker host.

For a nested/LXC Docker host that cannot load Docker's default AppArmor profile, use the included `compose.lxc.yaml` override with the base Compose file:

```bash
docker compose -f compose.yaml -f compose.lxc.yaml up -d --build
```

The LXC override adds `apparmor=unconfined` only where that environment requires it; it is not a general EplusTV requirement.

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

<p align="center">
  <img src="https://i.imgur.com/FIGZdR3.png">
</p>

Current version: **4.16.6**

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

# Running
The recommended way of running this fork is with Docker Compose from the repository. The Compose configuration builds the FOX One-enabled image locally and keeps application state in a persistent host directory.

## Environment Variables
| Environment Variable | Description | Required? | Default |
|---|---|---|---|
| BASE_URL | If using a reverse proxy, m3u will be generated with this as the base. | No | - |
| PUID | Current user ID. Use if you have permission issues. Needs to be combined with PGID. | No | - |
| PGID | Current group ID. Use if you have permission issues. Needs to be combined with PUID. | No | - |
| PORT | Port the API will be served on. You can set this if it conflicts with another service in your environment. | No | 8000 |

### Available Providers

#### Bally

Available for free

#### B1G+

Available to login with B1G+ credentials (or for free with certain ISP providers)

#### BZZR

Available to login with BZZR credentials

#### CBS Sports

Available to login with TV Provider. Please note that there is no token refresh option here. It will require re-authenticating every 30 days.

#### FloSports

Available to login with FloSports credentials

#### FOXOne

Available to login with TV Provider - Direct Subscription or ESPN Subscription Not Currently Supported

##### Linear Channels

Will create dedicated linear channels if using dedicated linear channels, otherwise will schedule events normally

| Network Name |
|---|
| FOX | Set if your TV provider supports it |
| MyNetwork TV | Set if your TV provider supports it |
| FS1 | Set if your TV provider supports it |
| FS2 | Set if your TV provider supports it |
| B1G Network | Set if your TV provider supports it |
| FOX Deportes | Set if your TV provider supports it |
| FOX News Channel | Set if your TV provider supports it |
| FOX Business Network | Set if your TV provider supports it |
| TMZ | Set if your TV provider supports it |
| Masked Singer | Set if your TV provider supports it |
| FOX Soul | Set if your TV provider supports it |
| FOX Weather | Set if your TV provider supports it |
| FOX Live Now | Set if your TV provider supports it |

#### FOX Sports

Available to login with TV Provider

##### Linear Channels

Some events are on linear channels and some aren't. If you use dedicated linear channels, only events that are on FOX will be scheduled normally. All other events will be scheduled to linear channels

| Network Name |
|---|
| FS1 | Set if your TV provider supports it |
| FS2 | Set if your TV provider supports it |
| B1G Network | Set if your TV provider supports it |
| FOX Soccer Plus | Set if your TV provider supports it |
| FOX Deportes | Set if your TV provider supports it |

##### Linear Channels

Will create dedicated linear channels if using dedicated linear channels, otherwise will schedule events normally

| Network Name | Description |
|---|---|
| MSG | MSG (If in your supported zone) |
| MSGSN | MSG Sportsnet HD (If in your supported zone) |
| MSG2 | MSG2 HD (If in your supported zone) |
| MSGSN2 | MSG Sportsnet 2 HD (If in your supported zone) |
| YES | Yes Network (If in your supported zone) |

#### Hudl

Various small college conferences, available for free

#### KBO

Available for free

#### KSL Sports

Available for free

#### LOVB

Use Victory+ instead

#### Midco Sports

Available to login with Midco Sports credentials

#### MLB.tv

Available to login with MLB.tv credentials

##### Extras
| Name | Description |
|---|---|
| Only free games | If you have a free account, only 1 free game per day will be scheduled |

##### Linear Channels

| Network Name | Description |
|---|---|
| Big Inning | Will create a dedicated linear channel if using dedicated linear channels, otherwise will schedule Big Inning normally |
| MLB Network | Only available if you have MLB Network as part of your MLB.tv account or have linked TVE Provider that provides access |
| SNY | Only available if you have SNY as part of your MLB.tv account or have linked TVE Provider that provides access |
| SNLA | Only available if you have SNLA+ as part of your MLB.tv account or have linked TVE Provider that provides access |

#### Mountain West

Available for free

#### NHL.tv

Available to login with NHL.tv account (Europe only)

#### NFL

Available to login with NFL.com credentials

This integration works with NFL+ or using other providers (TVE, Amazon Prime, Peacock, Sunday Ticket) to access games.

##### Extra Providers

If you don't have an NFL+ subscription, you can use these providers to access games.

| Provider Name | Description |
|---|---|
| Amazon Prime | Get TNF games from Amazon Prime |
| Peacock | Get SNF games from Peacock |
| TV Provider | Get in-market games from your TV Provider |
| Sunday Ticket | Get out-of-market games from Youtube |

##### Linear Channels

If you have access to NFL RedZone, it will be scheduled. If dedicated linear channels is set, it will be on its own channel

| Network Name | Description |
|---|---|
| NFL Network | NFL+ or TV Provider access |
| NFL RedZone | NFL+ Premium or TV Provider access |
| NFL Channel | Free channel for all accounts |

#### NWSL+

Available to login with NWSL+ credentials

#### Outside TV

Available to login with Outside TV credentials (free account)

##### Linear Channels

Dedicated linear channels - Will only schedule when dedicated linear channels is set

| Network Name |
|---|
| Outside |

#### Paramount+

Available to login with Paramount+ credentials

##### Linear Channels

Dedicated linear channels - Will only schedule when dedicated linear channels is set

| Network Name | Description |
|---|---|
| CBS Sports HQ | Set if your TV provider supports it |
| Golazo Network | Set if your TV provider supports it |

#### PWHL

Available for free

#### Victory+

Available to login with Victory+ credentials.

#### Women's Sports Network

Available for free - only linear channel

##### Linear Channels

| Network Name | Description |
|---|---|
| WSN | Women's Sports Network |

#### Zeam Live Events

Available for free

## Volumes
| Volume Name | Description | Required? |
|---|---|---|
| /app/config | Used to store DB and application state | Yes |


## Docker Run
From the repository root, build and start the service with:

```bash
docker compose up -d --build
```

The Compose service is named `eplustv`, exposes port `8000`, persists `/app/config` to `/opt/eplustv/config`, and uses `restart: unless-stopped`.

For a one-off Docker run, the equivalent is:

```bash
docker run -d --name eplustv --restart unless-stopped -p 8000:8000 -v /opt/eplustv/config:/app/config eplustv:foxone-profile-login
```

On the privileged LXC development host used for this project, Docker also requires `--security-opt apparmor=unconfined`; the included Compose file contains that host-specific setting. Remove it when deploying to a normal Docker host where Docker can load its default AppArmor profile.

Open the service in your web browser at `http://<ip>:8000`



### Docker Compose

The repository includes `compose.yaml` so the service can be rebuilt and restarted without manually reproducing the Docker command:

```bash
docker compose up -d --build
```

To stop it without deleting the persistent configuration:

```bash
docker compose down
```

## FOX One direct login research

This fork includes an experimental direct FOX One email/password login path based on the Profile API client flow documented in the companion research repository.

The existing TV/device-code authentication path remains available. Direct login:

- sends the user's credentials to the documented FOX One Profile API login endpoint;
- generates a local device UUID for the login request;
- stores authentication state only in EplusTV's existing local provider database;
- tests whether the returned Profile access token is accepted by the existing FOX One DTC entitlement service before enabling the provider;
- reuses the returned token for entitlement/event/playback requests when that compatibility test succeeds.

No API key, password, access token, refresh token, or other live credential is committed to Git.

The direct login path is intentionally experimental until it has been tested against an authorized FOX One account.
