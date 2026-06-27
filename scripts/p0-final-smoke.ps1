$ErrorActionPreference = 'Stop'

$envText = Get-Content -Raw -Path (Join-Path $PSScriptRoot '..\app\.env')
$url = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_URL=(.+)').Groups[1].Value.Trim()
$anon = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)').Groups[1].Value.Trim()
$secret = $env:BADIBOSS_WEBHOOK_SECRET
if (-not $secret) { throw 'BADIBOSS_WEBHOOK_SECRET is required' }

$pass = 'P0TestDc26!'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$results = New-Object System.Collections.Generic.List[string]

function Add-Result($name, $ok, $detail) {
  $status = if ($ok) { 'OK' } else { 'KO' }
  $script:results.Add(('{0}: {1} - {2}' -f $name, $status, $detail))
}

function Headers($token) {
  @{ apikey = $anon; Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
}

function Call-Json($method, $uri, $token, $bodyObj) {
  $headers = Headers $token
  $body = if ($null -ne $bodyObj) { $bodyObj | ConvertTo-Json -Depth 12 -Compress } else { $null }
  try {
    $args = @{ Uri = $uri; Method = $method; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 45 }
    if ($null -ne $body) { $args.Body = $body }
    $r = Invoke-WebRequest @args
    $json = if ($r.Content) { $r.Content | ConvertFrom-Json } else { $null }
    return @{ ok = $true; status = [int]$r.StatusCode; body = $json; raw = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    $status = if ($resp) { [int]$resp.StatusCode } else { 0 }
    $text = ''
    if ($resp) {
      $reader = New-Object IO.StreamReader($resp.GetResponseStream())
      $text = $reader.ReadToEnd()
    }
    return @{ ok = $false; status = $status; body = $text; raw = $text }
  }
}

function Sign-Body($body) {
  $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
  -join ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body)) | ForEach-Object { $_.ToString('x2') })
}

function Invoke-Webhook($obj) {
  $body = $obj | ConvertTo-Json -Depth 12 -Compress
  $sig = Sign-Body $body
  try {
    $r = Invoke-WebRequest `
      -Uri ($url + '/functions/v1/badiboss-webhook') `
      -Method POST `
      -Headers @{ 'Content-Type' = 'application/json'; 'x-badiboss-signature' = $sig } `
      -Body $body `
      -UseBasicParsing `
      -TimeoutSec 45
    return @{ ok = $true; status = [int]$r.StatusCode; body = ($r.Content | ConvertFrom-Json); raw = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    $status = if ($resp) { [int]$resp.StatusCode } else { 0 }
    $text = ''
    if ($resp) {
      $reader = New-Object IO.StreamReader($resp.GetResponseStream())
      $text = $reader.ReadToEnd()
    }
    return @{ ok = $false; status = $status; body = $text; raw = $text }
  }
}

function Signup-And-Login($email, $phone) {
  $signup = Call-Json 'POST' ($url + '/auth/v1/signup') $anon @{ email = $email; password = $pass; data = @{ phone = $phone } }
  Add-Result "register $email" ($signup.status -in @(200, 201)) "status $($signup.status)"

  $login = Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = $email; password = $pass }
  Add-Result "login $email" $login.ok "status $($login.status)"
  if (-not $login.ok) { throw "login failed for $email : $($login.raw)" }

  @{ token = $login.body.access_token; id = $login.body.user.id; email = $email; phone = $phone }
}

$male = Signup-And-Login "tel_p0_m_$stamp@gmail.com" "+243970$stamp"
$female = Signup-And-Login "tel_p0_f_$stamp@gmail.com" "+243971$stamp"

$adminLogin = Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = 'tel_243900000199@gmail.com'; password = 'TestDc26' }
Add-Result 'login admin test' $adminLogin.ok "status $($adminLogin.status)"
$adminToken = $adminLogin.body.access_token

$maleProfile = @{
  id = $male.id
  phone = $male.phone
  username = "p0_homme_$stamp"
  gender = 'M'
  age = 31
  city = 'Kinshasa'
  commune = 'Gombe'
  country = 'CD'
  bio = 'Profil test P0 homme'
  status = 'active'
  is_verified = $true
  role = 'user'
  mode_libre_active = $true
  mode_serieux_active = $true
}
$femaleProfile = @{
  id = $female.id
  phone = $female.phone
  username = "p0_femme_$stamp"
  gender = 'F'
  age = 28
  city = 'Kinshasa'
  commune = 'Lingwala'
  country = 'CD'
  bio = 'Profil test P0 femme'
  status = 'active'
  is_verified = $true
  role = 'user'
  mode_libre_active = $true
  mode_serieux_active = $true
  photo = "https://picsum.photos/seed/p0female$stamp/400/400"
}

$r = Call-Json 'POST' ($url + '/rest/v1/profiles') $male.token $maleProfile
Add-Result 'creation profil homme' ($r.status -in @(200, 201)) "status $($r.status)"
$r = Call-Json 'POST' ($url + '/rest/v1/profiles') $female.token $femaleProfile
Add-Result 'creation profil femme' ($r.status -in @(200, 201)) "status $($r.status)"

$r = Call-Json 'GET' ($url + '/rest/v1/profiles?select=id,gender,username,status&limit=5') $male.token $null
Add-Result 'affichage profils' $r.ok "status $($r.status) count $(@($r.body).Count)"

$existingConv = Call-Json 'GET' ($url + '/rest/v1/conversations?select=id,participant_ids&limit=1') $adminToken $null
Add-Result 'conversation existante' $existingConv.ok "status $($existingConv.status) count $(@($existingConv.body).Count)"

$packRef = "p0-pack-$stamp"
$packPayment = @{
  user_id = $male.id
  amount = 1.00
  currency = 'USD'
  payment_method = 'Badiboss Pay'
  payment_provider = 'Badiboss Pay'
  provider = 'contact_pack'
  transaction_ref = $packRef
  status = 'pending'
  metadata = @{ contact_quota = 2; photo_quota = 2; all_profiles_access = $false; source = 'p0_final_check' }
}
$r = Call-Json 'POST' ($url + '/rest/v1/payments') $male.token $packPayment
Add-Result 'achat pack cree pending' ($r.status -in @(200, 201)) "status $($r.status)"

$wh = Invoke-Webhook @{ event_id = "evt-pack-$stamp"; status = 'paid'; transaction_ref = $packRef }
Add-Result 'webhook activation pack serveur' $wh.ok "status $($wh.status) $($wh.raw)"

$r = Call-Json 'POST' ($url + '/rest/v1/rpc/unlock_profile_photo') $male.token @{ p_target_profile_id = $female.id; p_mode = 'global' }
Add-Result 'acces photo RPC' $r.ok "status $($r.status)"

$r = Call-Json 'POST' ($url + '/rest/v1/rpc/unlock_profile_contact') $male.token @{ p_target_profile_id = $female.id; p_mode = 'global' }
Add-Result 'acces contact RPC' $r.ok "status $($r.status)"

$newConv = Call-Json 'POST' ($url + '/rest/v1/conversations') $male.token @{
  participant_ids = @($male.id, $female.id)
  last_message_at = (Get-Date).ToUniversalTime().ToString('o')
}
Add-Result 'nouvelle conversation' ($newConv.status -in @(200, 201)) "status $($newConv.status)"

$boostRef = "p0-boost-$stamp"
$boostPayment = @{
  user_id = $female.id
  amount = 1.00
  currency = 'USD'
  payment_method = 'Badiboss Pay'
  payment_provider = 'Badiboss Pay'
  provider = 'visibility_boost'
  transaction_ref = $boostRef
  status = 'pending'
  metadata = @{ days = 1; source = 'p0_final_check' }
}
$r = Call-Json 'POST' ($url + '/rest/v1/payments') $female.token $boostPayment
Add-Result 'boost fille paiement pending' ($r.status -in @(200, 201)) "status $($r.status)"

$wh = Invoke-Webhook @{ event_id = "evt-boost-$stamp"; status = 'paid'; transaction_ref = $boostRef }
Add-Result 'webhook boost fille serveur' $wh.ok "status $($wh.status) $($wh.raw)"

$r = Call-Json 'GET' ($url + "/rest/v1/profiles?id=eq.$($female.id)&select=is_boosted,boosted_until") $female.token $null
$boosted = $r.ok -and @($r.body).Count -gt 0 -and $r.body[0].is_boosted
Add-Result 'verification boost fille' $boosted "status $($r.status)"

$r = Call-Json 'POST' ($url + '/rest/v1/rpc/grant_profile_entitlement') $adminToken @{
  target_user_id = $male.id
  target_profile_id = $female.id
  entitlement_type = 'photo'
  grant_mode = 'global'
  grant_source = 'admin_grant'
  grant_reason = 'p0 final admin grant'
  grant_metadata = @{ source = 'p0_final_check' }
}
Add-Result 'attribution admin entitlement' $r.ok "status $($r.status)"

$r = Call-Json 'GET' ($url + "/rest/v1/audit_events?select=action,target_user_id,reason&target_user_id=eq.$($male.id)&limit=5") $adminToken $null
Add-Result 'audit admin lisible' $r.ok "status $($r.status) count $(@($r.body).Count)"

$r = Call-Json 'GET' ($url + "/rest/v1/profile_access_events?select=event_type,access_type,user_id&user_id=eq.$($male.id)&limit=10") $male.token $null
Add-Result 'historique acces profil' $r.ok "status $($r.status) count $(@($r.body).Count)"

$results | ForEach-Object { Write-Output $_ }
