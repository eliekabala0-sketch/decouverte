$ErrorActionPreference = 'Stop'

$envText = Get-Content -Raw -Path (Join-Path $PSScriptRoot '..\app\.env')
$url = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_URL=(.+)').Groups[1].Value.Trim()
$anon = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)').Groups[1].Value.Trim()
$pass = 'P2ModDc26!'
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

function Signup-And-Login($email, $phone) {
  $signup = Call-Json 'POST' ($url + '/auth/v1/signup') $anon @{ email = $email; password = $pass; data = @{ phone = $phone } }
  $signupOk = $signup.status -in @(200, 201)
  $signupDetail = if ($signupOk) { "status $($signup.status)" } else { "status $($signup.status) $($signup.raw)" }
  Add-Result "register $email" $signupOk $signupDetail
  $login = Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = $email; password = $pass }
  Add-Result "login $email" $login.ok "status $($login.status)"
  @{ token = $login.body.access_token; id = $login.body.user.id; email = $email; phone = $phone }
}

function Insert-Profile($account, $username, $gender) {
  $profile = @{
    id = $account.id
    phone = $account.phone
    username = $username
    gender = $gender
    age = 30
    city = 'Kinshasa'
    commune = 'Gombe'
    country = 'CD'
    bio = "Profil smoke moderation $username"
    status = 'active'
    is_verified = $true
    role = 'user'
    mode_libre_active = $true
    mode_serieux_active = $true
    photo = "https://picsum.photos/seed/$username/400/400"
  }
  $r = Call-Json 'POST' ($url + '/rest/v1/profiles') $account.token $profile
  Add-Result "creation profil $username" ($r.status -in @(200, 201)) "status $($r.status)"
}

function Feed($token) {
  Call-Json 'POST' ($url + '/rest/v1/rpc/get_profile_feed') $token @{ p_mode = 'libre'; p_page = 0; p_page_size = 50 }
}

$male = Signup-And-Login "tel_p2_mod_m_$stamp@gmail.com" "+243987$stamp"
$female = Signup-And-Login "tel_p2_mod_f_$stamp@gmail.com" "+243988$stamp"
Insert-Profile $male "p2_mod_homme_$stamp" 'M'
Insert-Profile $female "p2_mod_femme_$stamp" 'F'

$adminLogin = Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = 'tel_243900000199@gmail.com'; password = 'TestDc26' }
Add-Result 'login admin test' $adminLogin.ok "status $($adminLogin.status)"
$adminToken = $adminLogin.body.access_token

$feedBefore = Feed $male.token
$foundBefore = @($feedBefore.body | Where-Object { $_.id -eq $female.id }).Count -gt 0
Add-Result 'feed contient cible avant blocage' ($feedBefore.ok -and $foundBefore) "status $($feedBefore.status)"

$block = Call-Json 'POST' ($url + '/rest/v1/rpc/block_profile') $male.token @{ p_target_profile_id = $female.id; p_reason = 'p2 moderation smoke' }
Add-Result 'block_profile RPC' $block.ok "status $($block.status)"

$feedAfter = Feed $male.token
$foundAfter = @($feedAfter.body | Where-Object { $_.id -eq $female.id }).Count -gt 0
Add-Result 'feed exclut cible bloquee' ($feedAfter.ok -and -not $foundAfter) "status $($feedAfter.status)"

$report = Call-Json 'POST' ($url + '/rest/v1/reports') $male.token @{
  reporter_id = $male.id
  reported_id = $female.id
  type = 'inappropriate'
  reason = 'p2 moderation smoke'
  status = 'pending'
}
Add-Result 'signalement cree' ($report.status -in @(200, 201)) "status $($report.status) $($report.raw)"

$moderate = Call-Json 'POST' ($url + '/rest/v1/rpc/set_profile_moderation_status') $adminToken @{
  p_profile_id = $female.id
  p_status = 'suspended'
  p_reason = 'p2 moderation smoke suspend'
}
Add-Result 'moderation admin suspend RPC' $moderate.ok "status $($moderate.status)"

$audit = Call-Json 'GET' ($url + "/rest/v1/audit_events?select=action,target_user_id,reason&target_user_id=eq.$($female.id)&action=eq.set_profile_moderation_status&limit=5") $adminToken $null
Add-Result 'audit moderation lisible' ($audit.ok -and @($audit.body).Count -ge 1) "count $(@($audit.body).Count)"

$restore = Call-Json 'POST' ($url + '/rest/v1/rpc/set_profile_moderation_status') $adminToken @{
  p_profile_id = $female.id
  p_status = 'active'
  p_reason = 'p2 moderation smoke restore'
}
Add-Result 'moderation admin restore RPC' $restore.ok "status $($restore.status)"

$results | ForEach-Object { Write-Output $_ }
