$ErrorActionPreference = 'Stop'

$envText = Get-Content -Raw -Path (Join-Path $PSScriptRoot '..\app\.env')
$url = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_URL=(.+)').Groups[1].Value.Trim()
$anon = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)').Groups[1].Value.Trim()
$pass = 'P2TestDc26!'
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
    return @{ ok = $false; status = $status; body = $text; raw = $text }
  }
}

function Signup-And-Login($email, $phone) {
  $signup = Call-Json 'POST' ($url + '/auth/v1/signup') $anon @{ email = $email; password = $pass; data = @{ phone = $phone } }
  Add-Result "register $email" ($signup.status -in @(200, 201)) "status $($signup.status)"

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
    bio = "Profil smoke P2 $username"
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

$sender = Signup-And-Login "tel_p2_sender_$stamp@gmail.com" "+243985$stamp"
$receiver = Signup-And-Login "tel_p2_receiver_$stamp@gmail.com" "+243986$stamp"
Insert-Profile $sender "p2_sender_$stamp" 'M'
Insert-Profile $receiver "p2_receiver_$stamp" 'F'

$conv = Call-Json 'POST' ($url + '/rest/v1/conversations') $sender.token @{
  participant_ids = @($sender.id, $receiver.id)
  last_message_at = (Get-Date).ToUniversalTime().ToString('o')
}
Add-Result 'conversation creee' ($conv.status -in @(200, 201)) "status $($conv.status)"

$convList = Call-Json 'GET' ($url + "/rest/v1/conversations?select=id&participant_ids=cs.%7B$($sender.id),$($receiver.id)%7D&order=created_at.desc&limit=1") $sender.token $null
$convId = @($convList.body)[0].id
Add-Result 'conversation retrouvee' ([bool]$convId) $convId

$msg = Call-Json 'POST' ($url + '/rest/v1/messages') $sender.token @{
  conversation_id = $convId
  sender_id = $sender.id
  content = "Message smoke P2 $stamp"
}
Add-Result 'message envoye' ($msg.status -in @(200, 201)) "status $($msg.status)"

$unreadBefore = Call-Json 'GET' ($url + "/rest/v1/messages?select=id&conversation_id=eq.$convId&sender_id=neq.$($receiver.id)&read_at=is.null") $receiver.token $null
Add-Result 'message non lu visible' ($unreadBefore.ok -and @($unreadBefore.body).Count -ge 1) "count $(@($unreadBefore.body).Count)"

$mark = Call-Json 'POST' ($url + '/rest/v1/rpc/mark_conversation_read') $receiver.token @{ p_conversation_id = $convId }
Add-Result 'mark_conversation_read RPC' ($mark.ok -and [int]$mark.body -ge 1) "status $($mark.status) changed $($mark.body)"

$unreadAfter = Call-Json 'GET' ($url + "/rest/v1/messages?select=id&conversation_id=eq.$convId&sender_id=neq.$($receiver.id)&read_at=is.null") $receiver.token $null
Add-Result 'message lu apres RPC' ($unreadAfter.ok -and @($unreadAfter.body).Count -eq 0) "count $(@($unreadAfter.body).Count)"

$pubState = Call-Json 'POST' ($url + '/rest/v1/user_publication_read_state') $receiver.token @{
  user_id = $receiver.id
  last_read_publications_at = (Get-Date).ToUniversalTime().ToString('o')
}
Add-Result 'etat lecture publications upsert-compatible' ($pubState.status -in @(200, 201, 204, 409)) "status $($pubState.status)"

$results | ForEach-Object { Write-Output $_ }
