$ErrorActionPreference = 'Stop'

$envText = Get-Content -Raw -Path (Join-Path $PSScriptRoot '..\app\.env')
$url = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_URL=(.+)').Groups[1].Value.Trim()
$anon = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)').Groups[1].Value.Trim()
$secret = $env:PAYMENT_WEBHOOK_SECRET
if (-not $secret) { $secret = $env:BADIBOSS_WEBHOOK_SECRET }
if (-not $secret) { throw 'PAYMENT_WEBHOOK_SECRET or BADIBOSS_WEBHOOK_SECRET is required' }

$pass = 'P2PayDc26!'
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

function Sign-Body($timestamp, $body) {
  $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
  -join ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body)) | ForEach-Object { $_.ToString('x2') })
}

function Invoke-Webhook($obj, $badSignature = $false) {
  $body = $obj | ConvertTo-Json -Depth 12 -Compress
  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $sig = if ($badSignature) { 'invalid-signature' } else { Sign-Body $ts $body }
  try {
    $r = Invoke-WebRequest `
      -Uri ($url + '/functions/v1/badiboss-webhook') `
      -Method POST `
      -Headers @{ 'Content-Type' = 'application/json'; 'x-badiboss-signature' = $sig; 'x-badiboss-timestamp' = "$ts" } `
      -Body $body `
      -UseBasicParsing `
      -TimeoutSec 60
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
  @{ token = $login.body.access_token; id = $login.body.user.id; email = $email; phone = $phone }
}

$account = Signup-And-Login "tel_p2_pay_$stamp@gmail.com" "+243972$stamp"

$profile = @{
  id = $account.id
  phone = $account.phone
  username = "p2_pay_$stamp"
  gender = 'M'
  age = 30
  city = 'Kinshasa'
  commune = 'Gombe'
  country = 'CD'
  bio = 'Smoke paiement'
  status = 'active'
  is_verified = $true
  role = 'user'
  mode_libre_active = $true
  mode_serieux_active = $true
  photo = "https://picsum.photos/seed/p2-pay-$stamp/400/400"
}
$profileRes = Call-Json 'POST' ($url + '/rest/v1/profiles') $account.token $profile
Add-Result 'creation profil paiement' ($profileRes.status -in @(200, 201)) "status $($profileRes.status)"

$create = Call-Json 'POST' ($url + '/functions/v1/payment-create') $account.token @{
  payment_type = 'contact_pack'
  amount = 1
  currency = 'USD'
  customer_phone = $account.phone
  network = 'OM'
  metadata = @{ contact_quota = 1; photo_quota = 0; smoke = 'p2-payment-gateway' }
}
if ($create.status -eq 500 -and $create.raw -match 'non configure') {
  $results.Add('payment-create: BLOCKED - PAYMENT_API_KEY/PAYMENT_API_SECRET non configures cote Supabase')
} else {
  Add-Result 'payment-create pack' ($create.status -in @(200, 201) -and $create.body.transaction_id) "status $($create.status)"
  $status = Call-Json 'POST' ($url + '/functions/v1/payment-status') $account.token @{ transaction_id = $create.body.transaction_id }
  Add-Result 'payment-status pack' ($status.status -eq 200) "status $($status.status) $($status.raw)"
}

$payment = Call-Json 'POST' ($url + '/rest/v1/payments?select=id') $account.token @{
  user_id = $account.id
  amount = 1
  currency = 'USD'
  payment_method = 'mobile_money'
  payment_provider = 'secure_checkout'
  provider = 'contact_pack'
  transaction_ref = "p2-webhook-$stamp"
  status = 'pending'
  metadata = @{ contact_quota = 2; photo_quota = 0; smoke = 'webhook' }
}
Add-Result 'paiement pending webhook cree' ($payment.status -in @(200, 201)) "status $($payment.status)"
$paymentId = if ($payment.body -is [array]) { $payment.body[0].id } else { $payment.body.id }

$bad = Invoke-Webhook @{ event_id = "p2-pay-bad-$stamp"; payment_id = $paymentId; status = 'completed' } $true
Add-Result 'webhook mauvaise signature refusee' ($bad.status -eq 401) "status $($bad.status)"

$good = Invoke-Webhook @{ event_id = "p2-pay-good-$stamp"; payment_id = $paymentId; status = 'completed' }
Add-Result 'webhook signe accepte' ($good.status -eq 200 -and $good.body.status -eq 'completed') "status $($good.status) $($good.raw)"

$access = Call-Json 'GET' ($url + "/rest/v1/profile_access?select=contact_quota&user_id=eq.$($account.id)") $account.token $null
$quota = if (@($access.body).Count -gt 0) { [int]$access.body[0].contact_quota } else { 0 }
Add-Result 'activation pack apres webhook' ($access.status -eq 200 -and $quota -ge 2) "quota $quota"

$boostPayment = Call-Json 'POST' ($url + '/rest/v1/payments?select=id') $account.token @{
  user_id = $account.id
  amount = 1
  currency = 'USD'
  payment_method = 'mobile_money'
  payment_provider = 'secure_checkout'
  provider = 'visibility_boost'
  transaction_ref = "p2-boost-webhook-$stamp"
  status = 'pending'
  metadata = @{ days = 3; smoke = 'boost-webhook' }
}
Add-Result 'paiement boost pending cree' ($boostPayment.status -in @(200, 201)) "status $($boostPayment.status)"
$boostPaymentId = if ($boostPayment.body -is [array]) { $boostPayment.body[0].id } else { $boostPayment.body.id }
$boost = Invoke-Webhook @{ event_id = "p2-boost-good-$stamp"; payment_id = $boostPaymentId; status = 'completed' }
Add-Result 'activation boost webhook accepte' ($boost.status -eq 200 -and $boost.body.status -eq 'completed') "status $($boost.status)"
$profileAfter = Call-Json 'GET' ($url + "/rest/v1/profiles?select=is_boosted,boosted_until&id=eq.$($account.id)") $account.token $null
$boosted = @($profileAfter.body).Count -gt 0 -and $profileAfter.body[0].is_boosted -eq $true
Add-Result 'boost actif apres webhook' ($profileAfter.status -eq 200 -and $boosted) "status $($profileAfter.status)"

$results | ForEach-Object { Write-Output $_ }
