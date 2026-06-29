$ErrorActionPreference = 'Stop'

$envText = Get-Content -Raw -Path (Join-Path $PSScriptRoot '..\app\.env')
$url = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_URL=(.+)').Groups[1].Value.Trim()
$anon = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)').Groups[1].Value.Trim()
$pass = 'P2AdminDc26!'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$results = New-Object System.Collections.Generic.List[string]

function Add-Result($name, $ok, $detail) {
  $status = if ($ok) { 'OK' } else { 'KO' }
  $script:results.Add(('{0}: {1} - {2}' -f $name, $status, $detail))
  if (-not $ok) { throw "$name failed: $detail" }
}

function Headers($token) {
  @{ apikey = $anon; Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
}

function Call-Json($method, $uri, $token, $bodyObj) {
  $headers = Headers $token
  if ($uri -like '*/rest/v1/*' -and $method -in @('POST', 'PATCH')) {
    $headers['Prefer'] = 'return=representation'
  }
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
    if (-not $text) { $text = $_.Exception.Message }
    return @{ ok = $false; status = $status; body = $text; raw = $text }
  }
}

$adminLogin = Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = 'tel_243900000199@gmail.com'; password = 'TestDc26' }
Add-Result 'login admin test' $adminLogin.ok "status $($adminLogin.status)"
$adminToken = $adminLogin.body.access_token

$signup = Call-Json 'POST' ($url + '/auth/v1/signup') $anon @{ email = "tel_p2_admin_action_$stamp@gmail.com"; password = $pass; data = @{ phone = "+243980$stamp" } }
Add-Result 'register compte test admin action' ($signup.status -in @(200, 201)) "status $($signup.status)"
$login = Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = "tel_p2_admin_action_$stamp@gmail.com"; password = $pass }
Add-Result 'login compte test admin action' $login.ok "status $($login.status)"
$testId = $login.body.user.id

$profile = Call-Json 'POST' ($url + '/rest/v1/profiles') $login.body.access_token @{
  id = $testId
  phone = "+243980$stamp"
  username = "p2_test_admin_action_$stamp"
  gender = 'M'
  age = 31
  city = 'Kinshasa'
  commune = 'Gombe'
  country = 'CD'
  bio = 'Compte test admin actions'
  status = 'active'
  is_verified = $true
  role = 'user'
  mode_libre_active = $true
  mode_serieux_active = $true
}
Add-Result 'creation profil test admin action' ($profile.status -in @(200, 201)) "status $($profile.status)"

foreach ($status in @('suspended', 'active', 'banned', 'active')) {
  $res = Call-Json 'POST' ($url + '/rest/v1/rpc/admin_set_profile_status') $adminToken @{ p_profile_id = $testId; p_status = $status; p_reason = "p2 admin actions smoke $status" }
  Add-Result "admin_set_profile_status $status" $res.ok "status $($res.status) $($res.raw)"
}

$audit = Call-Json 'GET' ($url + "/rest/v1/audit_events?select=action,target_user_id,reason&target_user_id=eq.$testId&action=eq.admin_set_profile_status&limit=10") $adminToken $null
Add-Result 'audit admin actions lisible' ($audit.ok -and @($audit.body).Count -ge 4) "count $(@($audit.body).Count)"

$results | ForEach-Object { Write-Output $_ }
