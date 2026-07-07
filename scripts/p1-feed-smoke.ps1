$ErrorActionPreference = 'Stop'

$envText = Get-Content -Raw -Path (Join-Path $PSScriptRoot '..\app\.env')
$url = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_URL=(.+)').Groups[1].Value.Trim()
$anon = [regex]::Match($envText, 'EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)').Groups[1].Value.Trim()
$adminPassword = if ($env:DEC_ADMIN_PASSWORD) { $env:DEC_ADMIN_PASSWORD } else { 'Badiboss@1' }
$pass = 'P1TestDc26!'
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

function Insert-Profile($account, $username, $gender, $photo, $bio) {
  $profile = @{
    id = $account.id
    phone = $account.phone
    username = $username
    gender = $gender
    age = 29
    city = 'Kinshasa'
    commune = 'Gombe'
    country = 'CD'
    bio = $bio
    status = 'active'
    is_verified = $true
    role = 'user'
    mode_libre_active = $true
    mode_serieux_active = $true
  }
  if ($photo) { $profile.photo = $photo }
  $r = Call-Json 'POST' ($url + '/rest/v1/profiles') $account.token $profile
  Add-Result "creation profil $username" ($r.status -in @(200, 201)) "status $($r.status)"
}

function Feed($token, $mode, $page, $pageSize) {
  Call-Json 'POST' ($url + '/rest/v1/rpc/get_profile_feed') $token @{
    p_mode = $mode
    p_page = $page
    p_page_size = $pageSize
  }
}

function Has-Phone($rows) {
  foreach ($row in @($rows)) {
    if (($row.PSObject.Properties.Name -contains 'phone') -or ($row.PSObject.Properties.Name -contains 'contact')) {
      return $true
    }
  }
  return $false
}

function Set-Setting($adminToken, $key, $value) {
  $encoded = [uri]::EscapeDataString("eq.$key")
  $r = Call-Json 'PATCH' ($url + "/rest/v1/admin_settings?key=$encoded") $adminToken @{ value = $value; updated_at = (Get-Date).ToUniversalTime().ToString('o') }
  Add-Result "setting $key=$value" ($r.status -in @(200, 204)) "status $($r.status)"
}

$male = Signup-And-Login "tel_p1_m_$stamp@gmail.com" "+243980$stamp"
$femaleTarget = Signup-And-Login "tel_p1_ft_$stamp@gmail.com" "+243981$stamp"
$femaleBoost = Signup-And-Login "tel_p1_fb_$stamp@gmail.com" "+243982$stamp"
$femaleViewer = Signup-And-Login "tel_p1_fv_$stamp@gmail.com" "+243983$stamp"
$maleTarget = Signup-And-Login "tel_p1_mt_$stamp@gmail.com" "+243984$stamp"

$adminLogin = Call-Json 'POST' ($url + '/auth/v1/token?grant_type=password') $anon @{ email = 'tel_243900000199@gmail.com'; password = $adminPassword }
Add-Result 'login admin test' $adminLogin.ok "status $($adminLogin.status)"
$adminToken = $adminLogin.body.access_token

Insert-Profile $male "p1_homme_$stamp" 'M' $null 'Profil test P1 homme viewer'
Insert-Profile $femaleTarget "p1_femme_target_$stamp" 'F' "https://picsum.photos/seed/p1target$stamp/400/400" 'Profil test P1 femme cible'
Insert-Profile $femaleBoost "p1_femme_boost_$stamp" 'F' "https://picsum.photos/seed/p1boost$stamp/400/400" 'Profil test P1 femme boost'
Insert-Profile $femaleViewer "p1_femme_viewer_$stamp" 'F' $null 'Profil test P1 femme viewer'
Insert-Profile $maleTarget "p1_homme_target_$stamp" 'M' $null 'Profil test P1 homme cible'

$originalReciprocal = $null
$settings = Call-Json 'GET' ($url + "/rest/v1/admin_settings?key=eq.reciprocal_matching_enabled&select=value") $adminToken $null
if ($settings.ok -and @($settings.body).Count -gt 0) { $originalReciprocal = [bool]$settings.body[0].value }

try {
  Set-Setting $adminToken 'reciprocal_matching_enabled' $false

  $boostUntil = (Get-Date).ToUniversalTime().AddDays(30).ToString('o')
  $r = Call-Json 'PATCH' ($url + "/rest/v1/profiles?id=eq.$($femaleBoost.id)") $adminToken @{
    boost_reason = 'admin'
    boosted_until = $boostUntil
    is_boosted = $true
  }
  Add-Result 'boost admin fille applique' ($r.status -in @(200, 204)) "status $($r.status)"

  $feedMale = Feed $male.token 'libre' 0 10
  Add-Result 'feed homme RPC' $feedMale.ok "status $($feedMale.status) rows $(@($feedMale.body).Count)"
  Add-Result 'feed homme sans phone' (-not (Has-Phone $feedMale.body)) 'aucune propriete phone/contact'
  Add-Result 'feed homme voit femmes' (@($feedMale.body | Where-Object { $_.gender -ne 'F' }).Count -eq 0) 'toutes les lignes retournees sont F'
  Add-Result 'feed homme exclut profil courant' (@($feedMale.body | Where-Object { $_.id -eq $male.id }).Count -eq 0) 'self absent'
  Add-Result 'feed boost prioritaire' (@($feedMale.body).Count -gt 0 -and $feedMale.body[0].id -eq $femaleBoost.id -and $feedMale.body[0].active_boost) "first $($feedMale.body[0].id)"

  $page0 = Feed $male.token 'libre' 0 1
  $page1 = Feed $male.token 'libre' 1 1
  Add-Result 'pagination page 0' $page0.ok "status $($page0.status)"
  Add-Result 'pagination page 1' $page1.ok "status $($page1.status)"
  $noDup = @($page0.body).Count -gt 0 -and @($page1.body).Count -gt 0 -and $page0.body[0].id -ne $page1.body[0].id
  Add-Result 'pagination sans doublon' $noDup "$($page0.body[0].id) / $($page1.body[0].id)"

  $r = Call-Json 'POST' ($url + '/rest/v1/rpc/unlock_profile_photo') $male.token @{ p_target_profile_id = $femaleTarget.id; p_mode = 'global' }
  Add-Result 'photo refusee sans droit' (-not $r.ok -and $r.status -ge 400) "status $($r.status)"
  $r = Call-Json 'POST' ($url + '/rest/v1/rpc/unlock_profile_contact') $male.token @{ p_target_profile_id = $femaleTarget.id; p_mode = 'global' }
  Add-Result 'contact refuse sans droit' (-not $r.ok -and $r.status -ge 400) "status $($r.status)"

  $r = Call-Json 'POST' ($url + '/rest/v1/rpc/grant_profile_entitlement') $adminToken @{
    target_user_id = $male.id
    target_profile_id = $femaleTarget.id
    entitlement_type = 'photo'
    grant_mode = 'global'
    grant_source = 'admin_grant'
    grant_reason = 'p1 feed smoke photo grant'
    grant_metadata = @{ source = 'p1_feed_smoke' }
  }
  Add-Result 'grant admin photo' $r.ok "status $($r.status)"
  $r = Call-Json 'POST' ($url + '/rest/v1/rpc/grant_profile_entitlement') $adminToken @{
    target_user_id = $male.id
    target_profile_id = $femaleTarget.id
    entitlement_type = 'contact'
    grant_mode = 'global'
    grant_source = 'admin_grant'
    grant_reason = 'p1 feed smoke contact grant'
    grant_metadata = @{ source = 'p1_feed_smoke' }
  }
  Add-Result 'grant admin contact' $r.ok "status $($r.status)"

  $r = Call-Json 'POST' ($url + '/rest/v1/rpc/unlock_profile_photo') $male.token @{ p_target_profile_id = $femaleTarget.id; p_mode = 'global' }
  Add-Result 'photo OK apres droit' $r.ok "status $($r.status)"
  $r = Call-Json 'POST' ($url + '/rest/v1/rpc/get_profile_private_details') $male.token @{ p_target_profile_id = $femaleTarget.id }
  $privateRows = @($r.body)
  Add-Result 'details prives RPC apres droit' ($r.ok -and $privateRows.Count -gt 0 -and $privateRows[0].photo -and -not (Has-Phone $privateRows)) "status $($r.status)"
  $r = Call-Json 'POST' ($url + '/rest/v1/rpc/unlock_profile_contact') $male.token @{ p_target_profile_id = $femaleTarget.id; p_mode = 'global' }
  Add-Result 'contact OK apres droit' $r.ok "status $($r.status)"

  $feedAfterGrant = Feed $male.token 'libre' 0 50
  $targetRow = @($feedAfterGrant.body | Where-Object { $_.id -eq $femaleTarget.id }) | Select-Object -First 1
  Add-Result 'feed droit photo expose cible autorisee' ($null -ne $targetRow -and $targetRow.can_view_full -and $targetRow.photo) "photo present $([bool]$targetRow.photo)"
  Add-Result 'feed apres droit sans phone' (-not (Has-Phone $feedAfterGrant.body)) 'aucune propriete phone/contact'

  $feedFemaleLimited = Feed $femaleViewer.token 'libre' 0 50
  Add-Result 'feed femme sans reciprocite RPC' $feedFemaleLimited.ok "status $($feedFemaleLimited.status) rows $(@($feedFemaleLimited.body).Count)"
  Add-Result 'feed femme sans reciprocite voit hommes' (@($feedFemaleLimited.body | Where-Object { $_.gender -ne 'M' }).Count -eq 0) 'toutes les lignes retournees sont M'
  Add-Result 'feed femme sans reciprocite teaser' (@($feedFemaleLimited.body | Where-Object { $_.can_view_full -or $_.photo }).Count -eq 0) 'aucun acces complet'
  Add-Result 'feed femme sans reciprocite sans phone' (-not (Has-Phone $feedFemaleLimited.body)) 'aucune propriete phone/contact'

  Set-Setting $adminToken 'reciprocal_matching_enabled' $true
  $feedFemaleReciprocal = Feed $femaleViewer.token 'libre' 0 50
  Add-Result 'feed femme avec reciprocite RPC' $feedFemaleReciprocal.ok "status $($feedFemaleReciprocal.status) rows $(@($feedFemaleReciprocal.body).Count)"
  Add-Result 'feed femme avec reciprocite voit hommes' (@($feedFemaleReciprocal.body | Where-Object { $_.gender -ne 'M' }).Count -eq 0) 'toutes les lignes retournees sont M'
  Add-Result 'feed femme avec reciprocite sans phone' (-not (Has-Phone $feedFemaleReciprocal.body)) 'aucune propriete phone/contact'
} finally {
  if ($null -ne $originalReciprocal) {
    try {
      Set-Setting $adminToken 'reciprocal_matching_enabled' $originalReciprocal
    } catch {
      Write-Output "restore reciprocal_matching_enabled failed: $($_.Exception.Message)"
    }
  }
}

$results | ForEach-Object { Write-Output $_ }
