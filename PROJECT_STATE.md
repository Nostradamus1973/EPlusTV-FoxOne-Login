# EPlusTV Project State

## Repository
- GitHub: `Nostradamus1973/EPlusTV-FoxOne-Login`
- Integration branch: `foxone-profile-login`
- Local project path: `/opt/eplustv-foxone-test`
- Package: `eplustv@4.16.6`

## Current live deployment
- Docker container: `eplustv`
- Image: `eplustv:foxone-profile-login`
- Container config mount: `/opt/eplustv/config:/app/config`
- Live database: `/opt/eplustv/config/misc.db`

## Linear channel numbering
The configured public linear start channel is **3600**.

The internal `CHANNELS.MAP` keys are not themselves the public channel numbers. The first currently enabled linear channel establishes the offset.

Current mapping formula:

`publicChannel = internalKey - linearChannelOffset + linearStartChannel`

The code implements this through `getLinearChannelOffset()`.

Verified live mapping after the fix:
- internal 112 (FS1) -> public 3602
- internal 113 (FS2) -> public 3603
- internal 114 (B1G Network) -> public 3604
- internal 116 (FOX News Channel) -> public 3606
- internal 117 (FOX Business Network) -> public 3607
- internal 118 (TMZ) -> public 3608

The absence of public 3600/3601 in the generated linear M3U is due to the corresponding earlier map entries being filtered by their `checkChannelEnabled` checks; it is not evidence of a numbering-formula failure.

## Fix history
The live container was running stale copies of `services/generate-m3u.ts` and `services/channels.ts`.

The live files were patched in-place from the corrected project source, then the generated `/linear-channels.m3u` endpoint was checked and showed the corrected numbering.

A full LXC restart was then performed and the numbering remained correct, confirming the fix survives the container/LXC lifecycle.

## Important operational constraint
Do **not** modify host/LXC/AppArmor configuration as part of this EplusTV numbering work. The numbering issue was solved at the EplusTV application source/container level.

## Source of truth
For future troubleshooting, check this file and the Git branch before repeating previously completed numbering investigation.
