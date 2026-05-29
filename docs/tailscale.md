# Goldbit Tailscale Access

Goldbit v2 can be used from a phone through Tailscale without opening a public
router port.

## Recommended Setup

1. Install Tailscale on the Windows PC running Goldbit.
2. Install Tailscale on the phone.
3. Sign in to both devices with the same tailnet.
4. Do not configure router port forwarding for Goldbit.
5. Start Goldbit in tailnet mode:

```bash
npm run dev:tailnet
```

6. Find the PC's Tailscale IP:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/tailnet-info.ps1
```

7. Open the shown URL on the phone while Tailscale is connected:

```text
http://<pc-tailscale-ip>:7777
```

Current verified setup:

```text
http://goldbit:7777
```

This URL works from the phone Chrome app when Tailscale is connected and
MagicDNS resolves the PC machine name `goldbit`.

## Windows Firewall

If the phone cannot open Goldbit but both devices are online in Tailscale,
Windows Firewall may be blocking inbound TCP 7777.

For a Tailnet-only allow rule, run PowerShell as Administrator:

```powershell
New-NetFirewallRule `
  -DisplayName "Goldbit Tailnet 7777" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 7777 `
  -RemoteAddress 100.64.0.0/10
```

This allows Tailscale's CGNAT address range only. Do not add a broad public
internet firewall rule for Goldbit.

Current firewall rule added on the Windows PC:

```text
Name: Goldbit Tailnet 7777
Protocol: TCP
Local port: 7777
Remote address: 100.64.0.0/10
```

## Optional: Tailscale Serve

Tailscale Serve can expose a local service privately inside the tailnet, often
with a convenient HTTPS name. If using Serve, Goldbit can stay bound to
localhost and Tailscale can forward the tailnet URL to local port 7777.

Example after installing Tailscale CLI:

```powershell
npm run dev
tailscale serve --http=7777 http://localhost:7777
```

Prefer private Tailnet access. Do not enable Tailscale Funnel for Goldbit unless
you intentionally want public internet exposure.
