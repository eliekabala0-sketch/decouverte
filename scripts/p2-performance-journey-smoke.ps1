$ErrorActionPreference = 'Stop'

$envText = Get-Content -Raw -Path (Join-Path $PSScriptRoot '..\app\.env')
$url = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_URL=(.+)').Groups[1].Value.Trim()
$anon = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)').Groups[1].Value.Trim()
$pass = 'P2PerfDc26!'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$metrics = New-Object System.Collections.Generic.List[object]

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
    $args = @{ Uri = $uri; Method = $method; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 60 }
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

function Measure-Step($name, [scriptblock]$block) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $result = & $block
    $sw.Stop()
    $script:metrics.Add([pscustomobject]@{ step = $name; ok = $true; ms = $sw.ElapsedMilliseconds; detail = '' })
    return $result
  } catch {
    $sw.Stop()
    $script:metrics.Add([pscustomobject]@{ step = $name; ok = $false; ms = $sw.ElapsedMilliseconds; detail = $_.Exception.Message })
    throw
  }
}

function Assert-Ok($name, $response, $allowedStatus = @(200, 201, 204)) {
  if ($response.status -notin $allowedStatus) {
    throw "$name status $($response.status) $($response.raw)"
  }
}

function Signup-And-Login($label, $email, $phone) {
  $signup = Measure-Step "$label inscription" {
    Call-Json 'POST' ($url + '/auth/v1/signup') $anon @{ email = $email; password = $pass; data = @{ phone = $phone } }
  }
  Assert-Ok "$label inscription" $signup @(200, 201)

  $login = Measure-Step "$label connexion" {
    Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = $email; password = $pass }
  }
  Assert-Ok "$label connexion" $login @(200)

  @{ token = $login.body.access_token; id = $login.body.user.id; email = $email; phone = $phone }
}

function Create-Profile($label, $account, $gender) {
  $profile = @{
    id = $account.id
    phone = $account.phone
    username = "perf_${label}_$stamp"
    gender = $gender
    age = 29
    city = 'Kinshasa'
    commune = 'Gombe'
    country = 'CD'
    bio = "Profil performance $label"
    status = 'active'
    is_verified = $true
    role = 'user'
    mode_libre_active = $true
    mode_serieux_active = $true
    photo = $null
  }
  $created = Measure-Step "$label creation profil" {
    Call-Json 'POST' ($url + '/rest/v1/profiles?select=id') $account.token $profile
  }
  Assert-Ok "$label creation profil" $created @(200, 201)
}

function Add-Photo($label, $account) {
  $photo = "https://picsum.photos/seed/perf-$label-$stamp/600/600"
  $updated = Measure-Step "$label ajout photo profil" {
    Call-Json 'PATCH' ($url + "/rest/v1/profiles?id=eq.$($account.id)") $account.token @{ photo = $photo }
  }
  Assert-Ok "$label ajout photo profil" $updated @(200, 204)

  $gallery = Measure-Step "$label ajout photo galerie" {
    Call-Json 'POST' ($url + '/rest/v1/profile_photos') $account.token @{
      user_id = $account.id
      photo_url = $photo
      is_primary = $true
      sort_order = 0
    }
  }
  Assert-Ok "$label ajout photo galerie" $gallery @(200, 201)
}

$male = Signup-And-Login 'homme' "tel_p2_perf_m_$stamp@gmail.com" "+243970$stamp"
$female = Signup-And-Login 'femme' "tel_p2_perf_f_$stamp@gmail.com" "+243971$stamp"
Create-Profile 'homme' $male 'M'
Create-Profile 'femme' $female 'F'
Add-Photo 'homme' $male
Add-Photo 'femme' $female

$feedMale = Measure-Step 'homme feed libre page 0' {
  Call-Json 'POST' ($url + '/rest/v1/rpc/get_profile_feed') $male.token @{ p_mode = 'libre'; p_page = 0; p_page_size = 20 }
}
Assert-Ok 'homme feed libre page 0' $feedMale @(200)
$leaksPhone = @($feedMale.body | Where-Object { $_.PSObject.Properties.Name -contains 'phone' }).Count
if ($leaksPhone -gt 0) { throw 'feed exposes phone' }

$feedFemale = Measure-Step 'femme feed libre page 0' {
  Call-Json 'POST' ($url + '/rest/v1/rpc/get_profile_feed') $female.token @{ p_mode = 'libre'; p_page = 0; p_page_size = 20 }
}
Assert-Ok 'femme feed libre page 0' $feedFemale @(200)

$targetForMale = @($feedMale.body | Where-Object { $_.id -eq $female.id } | Select-Object -First 1)
if (-not $targetForMale) { throw 'female target missing from male feed' }

$privateDenied = Measure-Step 'fiche privee refusee sans droit' {
  Call-Json 'POST' ($url + '/rest/v1/rpc/get_profile_private_details') $male.token @{ p_target_profile_id = $female.id }
}
if ($privateDenied.status -notin @(400, 403)) { throw "private details should be denied, got $($privateDenied.status)" }

$payment = Measure-Step 'achat pack cree pending' {
  Call-Json 'POST' ($url + '/rest/v1/payments') $male.token @{
    user_id = $male.id
    amount = 1
    currency = 'USD'
    payment_method = 'secure_checkout'
    payment_provider = 'secure_checkout'
    provider = 'contact_pack'
    transaction_ref = "perf-pack-$stamp"
    status = 'pending'
    metadata = @{ contact_quota = 1; photo_quota = 1 }
  }
}
Assert-Ok 'achat pack cree pending' $payment @(200, 201)

$conversation = Measure-Step 'nouvelle conversation' {
  Call-Json 'POST' ($url + '/rest/v1/conversations?select=id') $male.token @{
    participant_ids = @($male.id, $female.id)
    last_message_at = (Get-Date).ToUniversalTime().ToString('o')
  }
}
Assert-Ok 'nouvelle conversation' $conversation @(200, 201)
$conversationId = if ($conversation.body -is [array]) { $conversation.body[0].id } else { $conversation.body.id }
if (-not $conversationId) { throw 'conversation id missing after insert' }

$message = Measure-Step 'message utilisateur' {
  Call-Json 'POST' ($url + '/rest/v1/messages') $male.token @{
    conversation_id = $conversationId
    sender_id = $male.id
    content = 'Smoke performance'
  }
}
Assert-Ok 'message utilisateur' $message @(200, 201)

$relogin = Measure-Step 'homme reconnexion' {
  Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = $male.email; password = $pass }
}
Assert-Ok 'homme reconnexion' $relogin @(200)

$adminLogin = Measure-Step 'admin connexion' {
  Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = 'tel_243900000199@gmail.com'; password = 'TestDc26' }
}
Assert-Ok 'admin connexion' $adminLogin @(200)
$adminToken = $adminLogin.body.access_token

Measure-Step 'admin dashboard profils count' {
  $r = Call-Json 'GET' ($url + '/rest/v1/profiles?select=id&limit=1') $adminToken $null
  Assert-Ok 'admin dashboard profils count' $r @(200)
}
Measure-Step 'admin utilisateurs liste limitee' {
  $r = Call-Json 'GET' ($url + '/rest/v1/profiles?select=id,phone,username,role,status,created_at&order=created_at.desc&limit=100') $adminToken $null
  Assert-Ok 'admin utilisateurs liste limitee' $r @(200)
}
Measure-Step 'admin paiements liste limitee' {
  $r = Call-Json 'GET' ($url + '/rest/v1/payments?select=id,provider,status,amount,currency,created_at&order=created_at.desc&limit=150') $adminToken $null
  Assert-Ok 'admin paiements liste limitee' $r @(200)
}

$metrics | Sort-Object ms -Descending | Format-Table -AutoSize
$slow = @($metrics | Where-Object { $_.ms -gt 1500 })
if ($slow.Count -gt 0) {
  Write-Output ''
  Write-Output 'Etapes > 1500ms:'
  $slow | Sort-Object ms -Descending | Format-Table -AutoSize
}
