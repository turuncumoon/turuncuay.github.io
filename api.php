<?php
/**
 * BORSAVERSE API v2
 *  ?type=market | news | ipo | debug
 */
error_reporting(0);
@ini_set('display_errors', '0');
@set_time_limit(40);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
date_default_timezone_set('Europe/Istanbul');

$CACHE_DIR = __DIR__ . '/cache';
if (!is_dir($CACHE_DIR)) { @mkdir($CACHE_DIR, 0755, true); }
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
$HTTP_LOG = [];

function cache_get($f, $ttl) { return (is_file($f) && time() - filemtime($f) < $ttl) ? file_get_contents($f) : null; }
function cache_stale($f) { return is_file($f) ? file_get_contents($f) : null; }

function curl_base($url, $timeout, $cookies = false) {
    global $UA, $CACHE_DIR;
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
        CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_ENCODING => '', CURLOPT_USERAGENT => $UA,
        CURLOPT_HTTPHEADER => ['Accept: application/json, text/plain, application/rss+xml, */*', 'Accept-Language: en-US,en;q=0.9'],
    ];
    if ($cookies) { $opts[CURLOPT_COOKIEJAR] = "$CACHE_DIR/cookies.txt"; $opts[CURLOPT_COOKIEFILE] = "$CACHE_DIR/cookies.txt"; }
    curl_setopt_array($ch, $opts);
    return $ch;
}

/** Tek istek (cURL, olmazsa file_get_contents) */
function http_one($url, $timeout = 8, $cookies = false, $fopenFallback = true) {
    global $UA, $HTTP_LOG;
    if (function_exists('curl_init')) {
        $ch = curl_base($url, $timeout, $cookies);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $HTTP_LOG[] = [substr(preg_replace('#^https?://#', '', $url), 0, 70), $code, $err];
        if ($code === 200 && $body !== false && $body !== '') return $body;
        if (!$fopenFallback) return null;
    }
    if (ini_get('allow_url_fopen')) {
        $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'header' => "User-Agent: $UA\r\n"], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body) return $body;
        $HTTP_LOG[] = [substr(preg_replace('#^https?://#', '', $url), 0, 70), 0, 'fopen basarisiz'];
    }
    return null;
}

/** Paralel istek (8'li gruplar) */
function http_many(array $urls, $timeout = 6) {
    global $HTTP_LOG;
    $out = [];
    if (!function_exists('curl_multi_init')) { foreach ($urls as $k => $u) $out[$k] = http_one($u, $timeout); return $out; }
    foreach (array_chunk($urls, 8, true) as $chunk) {
        $mh = curl_multi_init(); $hs = [];
        foreach ($chunk as $k => $u) { $ch = curl_base($u, $timeout); curl_multi_add_handle($mh, $ch); $hs[$k] = $ch; }
        $run = null;
        do { curl_multi_exec($mh, $run); if ($run) curl_multi_select($mh, 1); } while ($run > 0);
        foreach ($hs as $k => $ch) {
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $out[$k] = $code === 200 ? curl_multi_getcontent($ch) : null;
            if ($code !== 200 && count($HTTP_LOG) < 40) $HTTP_LOG[] = [substr(preg_replace('#^https?://#', '', $urls[$k]), 0, 70), $code, curl_error($ch)];
            curl_multi_remove_handle($mh, $ch); curl_close($ch);
        }
        curl_multi_close($mh);
    }
    return $out;
}

/* ---------- Yahoo yardımcıları ---------- */
function yahoo_crumb($force = false) {
    global $CACHE_DIR;
    if (!function_exists('curl_init')) return null;
    $cf = "$CACHE_DIR/crumb.txt";
    if (!$force && is_file($cf) && is_file("$CACHE_DIR/cookies.txt") && time() - filemtime($cf) < 21600) {
        $c = trim(file_get_contents($cf));
        if ($c !== '') return $c;
    }
    @unlink("$CACHE_DIR/cookies.txt"); @unlink($cf);
    http_one('https://fc.yahoo.com', 8, true, false);                         // çerezi alır (404 dönmesi normal)
    $c = http_one('https://query2.finance.yahoo.com/v1/test/getcrumb', 8, true, false);
    $c = $c ? trim($c) : '';
    if ($c !== '' && strlen($c) < 40 && strpos($c, '<') === false && stripos($c, 'Too Many') === false && stripos($c, '{') === false) {
        @file_put_contents($cf, $c);
        return $c;
    }
    return null;
}

function yahoo_quotes(array $syms, $crumb) {
    $out = [];
    foreach (array_chunk($syms, 30) as $chunk) {
        $url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' . rawurlencode(implode(',', $chunk)) . '&crumb=' . rawurlencode($crumb);
        $body = http_one($url, 10, true, false);
        $j = $body ? json_decode($body, true) : null;
        $res = isset($j['quoteResponse']['result']) ? $j['quoteResponse']['result'] : [];
        foreach ($res as $q) { if (isset($q['symbol'])) $out[$q['symbol']] = $q; }
    }
    return $out;
}

function downsample($cl) {
    $cl = array_values(array_filter($cl, function($v){ return $v !== null; }));
    if (count($cl) > 30) { $st = count($cl) / 30; $d = []; for ($i = 0; $i < 30; $i++) $d[] = $cl[(int)floor($i * $st)]; $cl = $d; }
    return array_map(function($v){ return round($v, 4); }, $cl);
}

function yahoo_sparks(array $syms, $crumb) {
    $out = [];
    foreach (array_chunk($syms, 20) as $chunk) {
        $url = 'https://query1.finance.yahoo.com/v8/finance/spark?symbols=' . rawurlencode(implode(',', $chunk)) . '&range=1d&interval=15m' . ($crumb ? '&crumb=' . rawurlencode($crumb) : '');
        $body = http_one($url, 10, true, false);
        $j = $body ? json_decode($body, true) : null;
        if (!$j) continue;
        if (isset($j['spark']['result'])) {
            foreach ($j['spark']['result'] as $r) {
                $cl = isset($r['response'][0]['indicators']['quote'][0]['close']) ? $r['response'][0]['indicators']['quote'][0]['close'] : [];
                if (isset($r['symbol'])) $out[$r['symbol']] = downsample($cl);
            }
        } else {
            foreach ($j as $sym => $v) { if (is_array($v) && isset($v['close'])) $out[$sym] = downsample($v['close']); }
        }
    }
    return $out;
}


/* ---------- RSS / Atom ayrıştırma ---------- */
function clean_url($u, $https = false) {
    $u = trim((string)$u);
    if (!preg_match('#^https?://#i', $u)) return '';
    return $https ? preg_replace('#^http://#i', 'https://', $u) : $u;
}
function parse_feed($xmlStr, $cat, $source, $limit = 12) {
    $out = [];
    libxml_use_internal_errors(true);
    $xml = @simplexml_load_string($xmlStr, 'SimpleXMLElement', LIBXML_NOCDATA | LIBXML_NONET);
    if (!$xml) return $out;
    $items = [];
    if (isset($xml->channel->item)) { foreach ($xml->channel->item as $it) $items[] = $it; }
    elseif (isset($xml->item)) { foreach ($xml->item as $it) $items[] = $it; }
    elseif (isset($xml->entry)) { foreach ($xml->entry as $it) $items[] = $it; }
    $n = 0;
    foreach ($items as $it) {
        if ($n++ >= $limit) break;
        $title = (string)$it->title;
        if ($it->getName() === 'entry') {
            $link = '';
            foreach ($it->link as $l) {
                $a = $l->attributes(); $rel = isset($a['rel']) ? (string)$a['rel'] : 'alternate';
                if ($rel === 'alternate' && isset($a['href'])) { $link = (string)$a['href']; break; }
            }
            $desc = isset($it->summary) ? (string)$it->summary : (string)$it->content;
            $date = isset($it->published) ? (string)$it->published : (string)$it->updated;
        } else {
            $link = (string)$it->link; $desc = (string)$it->description; $date = (string)$it->pubDate;
            if ($date === '') { $dc = $it->children('http://purl.org/dc/elements/1.1/'); $date = (string)$dc->date; }
        }
        $link = clean_url($link);
        if ($link === '' || trim($title) === '') continue;
        $img = '';
        if (isset($it->enclosure) && strpos((string)$it->enclosure['type'], 'image') !== false) $img = (string)$it->enclosure['url'];
        if (!$img) {
            $media = $it->children('http://search.yahoo.com/mrss/');
            if (isset($media->content)) { $a = $media->content->attributes(); $img = (string)$a['url']; }
            elseif (isset($media->thumbnail)) { $a = $media->thumbnail->attributes(); $img = (string)$a['url']; }
        }
        if (!$img) {
            $enc = (string)$it->children('http://purl.org/rss/1.0/modules/content/')->encoded;
            if (preg_match('/<img[^>]+src=["\']([^"\']+)/i', $desc . $enc, $mm)) $img = $mm[1];
        }
        $img = clean_url($img, true);
        $text = trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($desc), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
        if (mb_strlen($text) > 170) $text = mb_substr($text, 0, 167) . '…';
        $out[] = [
            'title' => trim(html_entity_decode(strip_tags($title), ENT_QUOTES | ENT_HTML5, 'UTF-8')),
            'link' => $link, 'desc' => $text, 'img' => $img, 'source' => $source,
            'ts' => strtotime($date) ?: time(), 'cat' => $cat,
        ];
    }
    return $out;
}

/* ---------- Güvenli dış kaynak çekme (özel RSS için; iç ağa erişimi engeller) ---------- */
function is_public_host($host) {
    $host = strtolower((string)$host);
    if ($host === '' || $host === 'localhost' || substr($host, -6) === '.local' || substr($host, -9) === '.internal') return null;
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) $ips[] = $host;
    else { $r = @gethostbynamel($host); if ($r) $ips = $r; }
    if (!$ips) return null;
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return null;
    }
    return $ips[0];
}
function safe_fetch($url, $timeout = 8) {
    global $UA;
    if (!function_exists('curl_init')) return null;
    for ($i = 0; $i < 4; $i++) {
        $p = @parse_url($url);
        if (!$p || empty($p['scheme']) || empty($p['host'])) return null;
        $scheme = strtolower($p['scheme']);
        if (!in_array($scheme, ['http', 'https'])) return null;
        $port = isset($p['port']) ? (int)$p['port'] : ($scheme === 'https' ? 443 : 80);
        if (!in_array($port, [80, 443])) return null;
        $ip = is_public_host($p['host']);
        if (!$ip) return null;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_HEADER => true,
            CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_ENCODING => '', CURLOPT_USERAGENT => $UA, CURLOPT_MAXFILESIZE => 2000000,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_RESOLVE => [$p['host'] . ':' . $port . ':' . $ip],
        ]);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $hs = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);
        if ($resp === false) return null;
        $head = substr($resp, 0, $hs); $body = substr($resp, $hs);
        if ($code >= 300 && $code < 400 && preg_match('/^Location:\s*(\S+)/mi', $head, $m)) {
            $loc = trim($m[1]);
            if (!preg_match('#^https?://#i', $loc)) $loc = $scheme . '://' . $p['host'] . (substr($loc, 0, 1) === '/' ? '' : '/') . $loc;
            $url = $loc; continue;
        }
        return $code === 200 ? $body : null;
    }
    return null;
}

/* ---------- Teknik gösterge hesapları (tarayıcı için) ---------- */
function calc_rsi($c, $n = 14) {
    $cnt = count($c); if ($cnt <= $n) return null;
    $g = 0; $l = 0;
    for ($i = 1; $i <= $n; $i++) { $d = $c[$i] - $c[$i-1]; if ($d >= 0) $g += $d; else $l -= $d; }
    $g /= $n; $l /= $n;
    for ($i = $n + 1; $i < $cnt; $i++) {
        $d = $c[$i] - $c[$i-1];
        $g = ($g * ($n - 1) + ($d > 0 ? $d : 0)) / $n;
        $l = ($l * ($n - 1) + ($d < 0 ? -$d : 0)) / $n;
    }
    return $l == 0 ? 100 : 100 - 100 / (1 + $g / $l);
}
function calc_sma($c, $n) { $cnt = count($c); if ($cnt < $n) return null; return array_sum(array_slice($c, -$n)) / $n; }

$type = isset($_GET['type']) ? $_GET['type'] : 'market';

/* ================= DETAY (grafik + istatistik) ================= */
if ($type === 'detail') {
    $sym = isset($_GET['sym']) ? $_GET['sym'] : '';
    $range = isset($_GET['range']) ? $_GET['range'] : '1d';
    $R = ['1d'=>'15m','5d'=>'30m','1mo'=>'1d','6mo'=>'1d','1y'=>'1d','5y'=>'1wk'];
    if (!preg_match('/^[A-Za-z0-9\^\.\=\-]{1,20}$/', $sym) || !isset($R[$range])) {
        http_response_code(400); echo json_encode(['error' => 'Geçersiz istek']); exit;
    }
    $cf = "$CACHE_DIR/d_" . md5($sym . $range) . '.json';
    if ($c = cache_get($cf, $range === '1d' ? 60 : 600)) { echo $c; exit; }
    foreach (['query1', 'query2'] as $h) {
        $b = http_one("https://$h.finance.yahoo.com/v8/finance/chart/" . rawurlencode($sym) . "?interval=" . $R[$range] . "&range=$range", 8);
        $j = $b ? json_decode($b, true) : null;
        if (isset($j['chart']['result'][0])) { @file_put_contents($cf, $b); echo $b; exit; }
    }
    $st = cache_stale($cf);
    echo $st ? $st : json_encode(['error' => 'Veri alınamadı', 'log' => array_slice($HTTP_LOG, 0, 4)]);
    exit;
}

/* ================= SEMBOL ARAMA ================= */
if ($type === 'search') {
    $q = isset($_GET['q']) ? trim($_GET['q']) : '';
    if ($q === '' || mb_strlen($q) > 40) { echo json_encode(['quotes' => []]); exit; }
    $cf = "$CACHE_DIR/s_" . md5(mb_strtolower($q)) . '.json';
    if ($c = cache_get($cf, 3600)) { echo $c; exit; }
    $b = http_one('https://query2.finance.yahoo.com/v1/finance/search?q=' . rawurlencode($q) . '&quotesCount=8&newsCount=0&listsCount=0&lang=en-US', 8);
    $j = $b ? json_decode($b, true) : null;
    $out = [];
    $okTypes = ['EQUITY', 'ETF', 'INDEX', 'CURRENCY', 'FUTURE', 'CRYPTOCURRENCY', 'MUTUALFUND'];
    if (isset($j['quotes']) && is_array($j['quotes'])) {
        foreach ($j['quotes'] as $x) {
            if (!isset($x['symbol'])) continue;
            $t = isset($x['quoteType']) ? $x['quoteType'] : '';
            if (!in_array($t, $okTypes)) continue;
            $out[] = [
                'symbol' => $x['symbol'],
                'name' => isset($x['longname']) ? $x['longname'] : (isset($x['shortname']) ? $x['shortname'] : $x['symbol']),
                'exch' => isset($x['exchDisp']) ? $x['exchDisp'] : '',
                'type' => $t,
            ];
        }
    }
    $json = json_encode(['quotes' => $out], JSON_UNESCAPED_UNICODE);
    if ($j) @file_put_contents($cf, $json);
    echo $json;
    exit;
}

/* ================= ÖZEL SEMBOL FİYATLARI ================= */
if ($type === 'quote') {
    $syms = isset($_GET['symbols']) ? explode(',', $_GET['symbols']) : [];
    $syms = array_values(array_unique(array_filter($syms, function($x){ return preg_match('/^[A-Za-z0-9\^\.\=\-]{1,20}$/', $x); })));
    $syms = array_slice($syms, 0, 25);
    if (!$syms) { echo json_encode(['items' => []]); exit; }
    $cf = "$CACHE_DIR/q_" . md5(implode(',', $syms)) . '.json';
    if ($c = cache_get($cf, 60)) { echo $c; exit; }
    $urls = [];
    foreach ($syms as $sy) $urls[$sy] = 'https://query1.finance.yahoo.com/v8/finance/chart/' . rawurlencode($sy) . '?interval=15m&range=1d';
    $raw = http_many($urls);
    $items = [];
    foreach ($syms as $sy) {
        $j = !empty($raw[$sy]) ? json_decode($raw[$sy], true) : null;
        $res = isset($j['chart']['result'][0]) ? $j['chart']['result'][0] : null;
        if (!$res) continue;
        $m = $res['meta'];
        $cl = isset($res['indicators']['quote'][0]['close']) ? $res['indicators']['quote'][0]['close'] : [];
        $items[] = [
            'sym' => $sy,
            'name' => isset($m['longName']) ? $m['longName'] : (isset($m['shortName']) ? $m['shortName'] : $sy),
            'price' => isset($m['regularMarketPrice']) ? $m['regularMarketPrice'] : null,
            'prev' => isset($m['chartPreviousClose']) ? $m['chartPreviousClose'] : (isset($m['previousClose']) ? $m['previousClose'] : null),
            'cur' => isset($m['currency']) ? $m['currency'] : '',
            'spark' => downsample($cl),
        ];
    }
    $json = json_encode(['items' => $items], JSON_UNESCAPED_UNICODE);
    if ($items) @file_put_contents($cf, $json);
    echo $json;
    exit;
}

/* ================= DEBUG ================= */
if ($type === 'debug') {
    $t = microtime(true);
    $crumb = yahoo_crumb(true);
    $q = $crumb ? yahoo_quotes(['AAPL', 'THYAO.IS', 'USDTRY=X'], $crumb) : [];
    $chart = http_one('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=15m&range=1d', 8);
    $rss = http_one('https://www.trthaber.com/turkiye_articles.rss', 8);
    echo json_encode([
        'php' => PHP_VERSION,
        'curl' => function_exists('curl_init'),
        'curl_multi' => function_exists('curl_multi_init'),
        'allow_url_fopen' => (bool)ini_get('allow_url_fopen'),
        'simplexml' => function_exists('simplexml_load_string'),
        'cache_yazilabilir' => is_writable($CACHE_DIR),
        'yahoo_crumb' => $crumb ? 'OK' : 'ALINAMADI',
        'yahoo_quote_test' => count($q) . '/3 sembol geldi',
        'yahoo_chart_test' => $chart ? 'OK' : 'BASARISIZ',
        'rss_test' => $rss ? 'OK' : 'BASARISIZ',
        'http_kayitlari' => $HTTP_LOG,
        'sure_sn' => round(microtime(true) - $t, 2),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/* ================= PİYASA ================= */
if ($type === 'market') {
    $cacheFile = "$CACHE_DIR/market.json";
    if ($c = cache_get($cacheFile, 60)) { echo $c; exit; }

    $S = [
        'xu100'=>['XU100.IS','BIST 100','endeks'], 'xu030'=>['XU030.IS','BIST 30','endeks'],
        'ixic'=>['^IXIC','NASDAQ Comp.','endeks'], 'ndx'=>['^NDX','NASDAQ 100','endeks'], 'spx'=>['^GSPC','S&P 500','endeks'],
        'THYAO'=>['THYAO.IS','Türk Hava Yolları','bist'], 'GARAN'=>['GARAN.IS','Garanti BBVA','bist'],
        'AKBNK'=>['AKBNK.IS','Akbank','bist'], 'ISCTR'=>['ISCTR.IS','İş Bankası (C)','bist'],
        'YKBNK'=>['YKBNK.IS','Yapı Kredi','bist'], 'ASELS'=>['ASELS.IS','Aselsan','bist'],
        'EREGL'=>['EREGL.IS','Ereğli Demir Çelik','bist'], 'BIMAS'=>['BIMAS.IS','BİM Mağazalar','bist'],
        'KCHOL'=>['KCHOL.IS','Koç Holding','bist'], 'SAHOL'=>['SAHOL.IS','Sabancı Holding','bist'],
        'SISE'=>['SISE.IS','Şişecam','bist'], 'TUPRS'=>['TUPRS.IS','Tüpraş','bist'],
        'FROTO'=>['FROTO.IS','Ford Otosan','bist'], 'TCELL'=>['TCELL.IS','Turkcell','bist'],
        'PGSUS'=>['PGSUS.IS','Pegasus','bist'], 'SASA'=>['SASA.IS','SASA Polyester','bist'],
        'KRDMD'=>['KRDMD.IS','Kardemir (D)','bist'], 'TOASO'=>['TOASO.IS','Tofaş','bist'],
        'EKGYO'=>['EKGYO.IS','Emlak Konut','bist'], 'PETKM'=>['PETKM.IS','Petkim','bist'],
        'AAPL'=>['AAPL','Apple','nasdaq'], 'MSFT'=>['MSFT','Microsoft','nasdaq'], 'NVDA'=>['NVDA','NVIDIA','nasdaq'],
        'AMZN'=>['AMZN','Amazon','nasdaq'], 'GOOGL'=>['GOOGL','Alphabet','nasdaq'], 'META'=>['META','Meta Platforms','nasdaq'],
        'TSLA'=>['TSLA','Tesla','nasdaq'], 'AVGO'=>['AVGO','Broadcom','nasdaq'], 'NFLX'=>['NFLX','Netflix','nasdaq'],
        'AMD'=>['AMD','AMD','nasdaq'], 'COST'=>['COST','Costco','nasdaq'], 'INTC'=>['INTC','Intel','nasdaq'],
        'USDTRY'=>['USDTRY=X','Dolar / TL','doviz'], 'EURTRY'=>['EURTRY=X','Euro / TL','doviz'],
        'GBPTRY'=>['GBPTRY=X','Sterlin / TL','doviz'], 'CHFTRY'=>['CHFTRY=X','İsviçre Frangı / TL','doviz'],
        'JPYTRY'=>['JPYTRY=X','Japon Yeni / TL','doviz'], 'EURUSD'=>['EURUSD=X','EUR / USD','doviz'],
        'GBPUSD'=>['GBPUSD=X','GBP / USD','doviz'], 'USDJPY'=>['USDJPY=X','USD / JPY','doviz'],
        'XAUUSD'=>['GC=F','Altın (ons)','emtia'], 'XAGUSD'=>['SI=F','Gümüş (ons)','emtia'],
        'BRENT'=>['BZ=F','Brent Petrol','emtia'], 'WTI'=>['CL=F','Ham Petrol (WTI)','emtia'],
        'NATGAS'=>['NG=F','Doğalgaz','emtia'], 'COPPER'=>['HG=F','Bakır','emtia'], 'PLAT'=>['PL=F','Platin','emtia'],
        'BTC'=>['BTC-USD','Bitcoin','kripto'], 'ETH'=>['ETH-USD','Ethereum','kripto'],
        'dji'=>['^DJI','Dow Jones','global'], 'rut'=>['^RUT','Russell 2000','global'], 'dax'=>['^GDAXI','DAX (Almanya)','global'],
        'ftse'=>['^FTSE','FTSE 100 (İngiltere)','global'], 'cac'=>['^FCHI','CAC 40 (Fransa)','global'], 'n225'=>['^N225','Nikkei 225 (Japonya)','global'],
        'hsi'=>['^HSI','Hang Seng (Hong Kong)','global'], 'ssec'=>['000001.SS','Şanghay Bileşik','global'],
        'vix'=>['^VIX','VIX (Korku Endeksi)','gosterge'], 'dxy'=>['DX-Y.NYB','Dolar Endeksi (DXY)','gosterge'],
        'y13w'=>['^IRX','ABD 13 Haftalık','tahvil'], 'y5'=>['^FVX','ABD 5 Yıllık','tahvil'], 'y10'=>['^TNX','ABD 10 Yıllık','tahvil'], 'y30'=>['^TYX','ABD 30 Yıllık','tahvil'],
    ];
    $symList = []; foreach ($S as $id => $s) $symList[] = $s[0];

    $items = [];
    foreach ($S as $id => $s) {
        $items[$id] = ['id'=>$id,'sym'=>$s[0],'name'=>$s[1],'group'=>$s[2],'price'=>null,'prev'=>null,'chg'=>null,'pct'=>null,'spark'=>[],'cur'=>'','mcap'=>null];
    }
    $src = ['quote' => 0, 'chart' => 0];

    // 1) Yahoo quote (tek istekte toplu) + spark
    $crumb = yahoo_crumb();
    if ($crumb) {
        $quotes = yahoo_quotes($symList, $crumb);
        if (!$quotes) { $crumb = yahoo_crumb(true); if ($crumb) $quotes = yahoo_quotes($symList, $crumb); }
        foreach ($S as $id => $s) {
            if (isset($quotes[$s[0]]['regularMarketPrice'])) {
                $q = $quotes[$s[0]];
                $items[$id]['price'] = $q['regularMarketPrice'];
                $items[$id]['prev'] = isset($q['regularMarketPreviousClose']) ? $q['regularMarketPreviousClose'] : null;
                $items[$id]['cur'] = isset($q['currency']) ? $q['currency'] : '';
                $items[$id]['mcap'] = isset($q['marketCap']) ? $q['marketCap'] : null;
                $src['quote']++;
            }
        }
        if ($src['quote'] > 0) {
            $sparks = yahoo_sparks($symList, $crumb);
            foreach ($S as $id => $s) if (isset($sparks[$s[0]])) $items[$id]['spark'] = $sparks[$s[0]];
        }
    }

    // 2) Eksik kalanlar için tek tek chart
    $missing = [];
    foreach ($S as $id => $s) if ($items[$id]['price'] === null) $missing[$id] = $s[0];
    if ($missing) {
        $mk = function($host) use ($missing) {
            $u = []; foreach ($missing as $id => $sym) $u[$id] = "https://$host/v8/finance/chart/" . rawurlencode($sym) . '?interval=15m&range=1d'; return $u;
        };
        $raw = http_many($mk('query1.finance.yahoo.com'));
        $retry = [];
        foreach ($missing as $id => $sym) if (empty($raw[$id])) $retry[$id] = "https://query2.finance.yahoo.com/v8/finance/chart/" . rawurlencode($sym) . '?interval=15m&range=1d';
        if ($retry && count($retry) < count($missing)) { foreach (http_many($retry) as $k => $v) if ($v) $raw[$k] = $v; }
        foreach ($missing as $id => $sym) {
            $j = !empty($raw[$id]) ? json_decode($raw[$id], true) : null;
            $res = isset($j['chart']['result'][0]) ? $j['chart']['result'][0] : null;
            if (!$res) continue;
            $m = $res['meta'];
            $items[$id]['price'] = isset($m['regularMarketPrice']) ? $m['regularMarketPrice'] : null;
            $items[$id]['prev'] = isset($m['chartPreviousClose']) ? $m['chartPreviousClose'] : (isset($m['previousClose']) ? $m['previousClose'] : null);
            $items[$id]['cur'] = isset($m['currency']) ? $m['currency'] : '';
            $cl = isset($res['indicators']['quote'][0]['close']) ? $res['indicators']['quote'][0]['close'] : [];
            $items[$id]['spark'] = downsample($cl);
            if ($items[$id]['price'] !== null) $src['chart']++;
        }
    }

    // Türev: gram altın / gümüş
    foreach ([['GRAMALTIN','Gram Altın (TL)','XAUUSD'],['GRAMGUMUS','Gram Gümüş (TL)','XAGUSD']] as $g) {
        $b = $items[$g[2]]; $u = $items['USDTRY'];
        if ($b['price'] && $u['price']) {
            $items[$g[0]] = ['id'=>$g[0],'sym'=>'-','name'=>$g[1],'group'=>'emtia','cur'=>'TRY','price'=>$b['price']*$u['price']/31.1035,
                'prev'=>($b['prev'] && $u['prev']) ? $b['prev']*$u['prev']/31.1035 : null, 'spark'=>$b['spark'], 'chg'=>null, 'pct'=>null];
        }
    }
    $ok = 0;
    foreach ($items as &$r) {
        if ($r['price'] !== null) $ok++;
        if ($r['price'] !== null && !empty($r['prev'])) { $r['chg'] = $r['price'] - $r['prev']; $r['pct'] = $r['chg'] / $r['prev'] * 100; }
    } unset($r);

    $out = ['updated'=>time(),'ok'=>$ok,'total'=>count($items),'src'=>$src,'items'=>array_values($items)];
    if ($ok === 0) $out['log'] = array_slice($HTTP_LOG, 0, 10);
    $json = json_encode($out, JSON_UNESCAPED_UNICODE);
    if ($ok > 0) { @file_put_contents($cacheFile, $json); echo $json; }
    else { $st = cache_stale($cacheFile); echo $st ? $st : $json; }
    exit;
}

/* ================= HABERLER ================= */
if ($type === 'news') {
    $cacheFile = "$CACHE_DIR/news.json";
    if ($c = cache_get($cacheFile, 300)) { echo $c; exit; }

    $FEEDS = [
        'turkiye'  => ['TRT Haber'=>'https://www.trthaber.com/turkiye_articles.rss', 'AA'=>'https://www.aa.com.tr/tr/rss/default?cat=guncel'],
        'dunya'    => ['BBC Türkçe'=>'https://feeds.bbci.co.uk/turkce/rss.xml', 'TRT Haber'=>'https://www.trthaber.com/dunya_articles.rss'],
        'ekonomi'  => ['TRT Haber'=>'https://www.trthaber.com/ekonomi_articles.rss', 'AA'=>'https://www.aa.com.tr/tr/rss/default?cat=ekonomi'],
        'teknoloji'=> ['Webtekno'=>'https://www.webtekno.com/rss.xml', 'ShiftDelete'=>'https://shiftdelete.net/feed'],
    ];
    $urls = [];
    foreach ($FEEDS as $cat => $srcs) foreach ($srcs as $name => $u) $urls["$cat|$name"] = $u;
    $raw = http_many($urls, 10);

    $news = ['turkiye'=>[],'dunya'=>[],'ekonomi'=>[],'teknoloji'=>[]];
    foreach ($raw as $key => $xmlStr) {
        if (!$xmlStr) continue;
        $p = explode('|', $key, 2);
        foreach (parse_feed($xmlStr, $p[0], $p[1], 12) as $it) $news[$p[0]][] = $it;
    }
    $total = 0;
    foreach ($news as $cat => &$list) {
        usort($list, function($a, $b){ return $b['ts'] <=> $a['ts']; });
        $list = array_slice($list, 0, 16); $total += count($list);
    } unset($list);

    $pools = [];
    foreach (['dunya','turkiye','ekonomi','teknoloji'] as $c) $pools[$c] = array_values(array_filter($news[$c], function($x){ return $x['img'] !== ''; }));
    $order = ['dunya','turkiye','ekonomi','teknoloji']; $top = []; $seen = [];
    for ($i = 0; $i < 40 && count($top) < 5; $i++) {
        $c = $order[$i % 4]; $ix = intdiv($i, 4);
        if (isset($pools[$c][$ix]) && !isset($seen[$pools[$c][$ix]['link']])) { $top[] = $pools[$c][$ix]; $seen[$pools[$c][$ix]['link']] = 1; }
    }
    $json = json_encode(['updated'=>time(),'top'=>$top,'news'=>$news], JSON_UNESCAPED_UNICODE);
    if ($total > 0) { @file_put_contents($cacheFile, $json); echo $json; }
    else { $st = cache_stale($cacheFile); echo $st ? $st : $json; }
    exit;
}

/* ================= ÖZEL RSS KAYNAĞI ================= */
if ($type === 'rss') {
    $url = isset($_GET['url']) ? trim($_GET['url']) : '';
    $cat = isset($_GET['cat']) && in_array($_GET['cat'], ['turkiye','dunya','ekonomi','teknoloji']) ? $_GET['cat'] : 'dunya';
    $name = isset($_GET['name']) ? mb_substr(strip_tags($_GET['name']), 0, 40) : 'Özel kaynak';
    if ($url === '' || strlen($url) > 400) { echo json_encode(['items' => [], 'error' => 'Geçersiz adres']); exit; }
    $cf = "$CACHE_DIR/r_" . md5($url . $cat . $name) . '.json';
    if ($c = cache_get($cf, 300)) { echo $c; exit; }
    $body = safe_fetch($url, 8);
    if (!$body) { $st = cache_stale($cf); echo $st ? $st : json_encode(['items' => [], 'error' => 'Kaynak alınamadı veya adres izin verilmiyor']); exit; }
    $items = parse_feed($body, $cat, $name, 12);
    $json = json_encode(['items' => $items, 'error' => $items ? null : 'Akışta haber bulunamadı'], JSON_UNESCAPED_UNICODE);
    if ($items) @file_put_contents($cf, $json);
    echo $json; exit;
}

/* ================= HİSSE TARAYICI VERİSİ ================= */
if ($type === 'scan') {
    $syms = isset($_GET['symbols']) ? explode(',', $_GET['symbols']) : [];
    $syms = array_values(array_unique(array_filter($syms, function($x){ return preg_match('/^[A-Za-z0-9\^\.\=\-]{1,20}$/', $x); })));
    $syms = array_slice($syms, 0, 60);
    $res = []; $need = [];
    foreach ($syms as $sy) {
        $cf = "$CACHE_DIR/sc_" . md5($sy) . '.json';
        if ($c = cache_get($cf, 900)) { $res[$sy] = json_decode($c, true); } else $need[$sy] = 'https://query1.finance.yahoo.com/v8/finance/chart/' . rawurlencode($sy) . '?interval=1d&range=6mo';
    }
    if ($need) {
        $raw = http_many($need, 8);
        foreach ($need as $sy => $u) {
            $j = !empty($raw[$sy]) ? json_decode($raw[$sy], true) : null;
            $r0 = isset($j['chart']['result'][0]) ? $j['chart']['result'][0] : null;
            if (!$r0) continue;
            $cl = array_values(array_filter(isset($r0['indicators']['quote'][0]['close']) ? $r0['indicators']['quote'][0]['close'] : [], function($v){ return $v !== null; }));
            $hi = array_values(array_filter(isset($r0['indicators']['quote'][0]['high']) ? $r0['indicators']['quote'][0]['high'] : [], function($v){ return $v !== null; }));
            $lo = array_values(array_filter(isset($r0['indicators']['quote'][0]['low']) ? $r0['indicators']['quote'][0]['low'] : [], function($v){ return $v !== null; }));
            $cnt = count($cl); if ($cnt < 15) continue;
            $m = $r0['meta']; $last = $cl[$cnt-1];
            $h52 = isset($m['fiftyTwoWeekHigh']) ? $m['fiftyTwoWeekHigh'] : ($hi ? max($hi) : max($cl));
            $l52 = isset($m['fiftyTwoWeekLow']) ? $m['fiftyTwoWeekLow'] : ($lo ? min($lo) : min($cl));
            $row = [
                'rsi' => calc_rsi($cl, 14), 'sma20' => calc_sma($cl, 20), 'sma50' => calc_sma($cl, 50),
                'h52' => $h52, 'l52' => $l52, 'last' => $last,
                'r1m' => $cnt > 22 ? ($last / $cl[$cnt-22] - 1) * 100 : null,
                'r3m' => $cnt > 64 ? ($last / $cl[$cnt-64] - 1) * 100 : null,
            ];
            $res[$sy] = $row;
            @file_put_contents("$CACHE_DIR/sc_" . md5($sy) . '.json', json_encode($row));
        }
    }
    echo json_encode(['updated' => time(), 'items' => (object)$res]);
    exit;
}

/* ================= HALKA ARZ ================= */
if ($type === 'ipo') {
    $f = __DIR__ . '/data/halkaarz.json';
    echo is_file($f) ? file_get_contents($f) : '[]';
    exit;
}
http_response_code(400);
echo json_encode(['error' => 'Geçersiz istek']);
