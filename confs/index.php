<?php
/**
 * Directory listing for /confs/ on Hostinger/LiteSpeed.
 *
 * LiteSpeed HTML-escapes HEADER.html and ignores AutoIndexUri in .htaccess,
 * so bare directories are rewritten here (see .htaccess) or served via
 * DirectoryIndex when this file lives in the requested folder.
 */

declare(strict_types=1);

$confsRoot = realpath(__DIR__);
if ($confsRoot === false) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo "Server misconfiguration.\n";
    exit;
}

$rel = isset($_GET['path']) ? (string) $_GET['path'] : '';
$rel = str_replace('\\', '/', $rel);
$rel = rawurldecode($rel);
$rel = trim($rel, '/');
if (strpos($rel, '..') !== false) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=UTF-8');
    echo "Invalid path.\n";
    exit;
}

$path = $rel === '' ? $confsRoot : $confsRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
$real = realpath($path);
if ($real === false || !is_dir($real) || strpos($real, $confsRoot) !== 0) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    echo "Directory not found.\n";
    exit;
}
// Ensure we stay inside confs/ even for edge realpath cases (e.g. confs vs confs-backup)
if ($real !== $confsRoot && strpos($real, $confsRoot . DIRECTORY_SEPARATOR) !== 0) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=UTF-8');
    echo "Forbidden.\n";
    exit;
}

$path = $real;
$uriPath = '/confs/' . ($rel === '' ? '' : $rel . '/');

$ignoreExt = [
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'css', 'js',
    'html', 'htm', 'php', 'pdf', 'txt', 'xml', 'json',
    'zip', 'tar', 'gz', 'mp3', 'mp4', 'htaccess',
];
$ignoreNames = [
    '.htaccess', 'header.html', 'readme.html', 'autoindex.php', 'index.php', '.ds_store',
    'template-presentations-landingpage',
];

$entries = @scandir($path);
if ($entries === false) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo "Unable to read directory.\n";
    exit;
}

$dirs = [];
$files = [];

foreach ($entries as $name) {
    if ($name === '.' || $name === '..') {
        continue;
    }
    if ($name[0] === '.') {
        continue;
    }
    if (in_array(strtolower($name), $ignoreNames, true)) {
        continue;
    }

    $full = $path . DIRECTORY_SEPARATOR . $name;
    if (is_dir($full)) {
        $dirs[] = $name;
        continue;
    }

    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($ext !== '' && in_array($ext, $ignoreExt, true)) {
        continue;
    }
    $files[] = $name;
}

natcasesort($dirs);
natcasesort($files);
$dirs = array_values($dirs);
$files = array_values($files);

$parentUri = dirname($uriPath);
if ($parentUri === '/' || $parentUri === '\\' || $parentUri === '.') {
    $parentUri = '/';
} else {
    $parentUri = rtrim(str_replace('\\', '/', $parentUri), '/') . '/';
}

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function format_size(int $bytes): string
{
    if ($bytes < 1024) {
        return (string) $bytes;
    }
    $units = ['K', 'M', 'G', 'T'];
    $size = (float) $bytes;
    foreach ($units as $unit) {
        $size /= 1024;
        if ($size < 1024) {
            return sprintf('%.1f%s', $size, $unit);
        }
    }
    return sprintf('%.1fP', $size / 1024);
}

header('Content-Type: text/html; charset=UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Index of <?= h($uriPath) ?></title>
    <style>
        body {
            font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
            background: #14161a;
            color: #e8eaed;
            margin: 0;
            padding: 2.5rem;
        }

        h1 {
            font-size: 1.4rem;
            font-weight: 600;
            margin: 0 0 1.5rem;
            color: #fff;
            word-break: break-all;
        }

        table {
            border-collapse: collapse;
            width: 100%;
            max-width: 800px;
        }

        thead th {
            text-align: left;
            font-size: .75rem;
            text-transform: uppercase;
            letter-spacing: .08em;
            color: #9aa0a6;
            padding: .6rem .75rem;
            border-bottom: 1px solid #2b2f36;
        }

        td {
            padding: .55rem .75rem;
            border-bottom: 1px solid #232730;
        }

        a {
            color: #8ab4f8;
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        tr:hover td {
            background: #1b1e24;
        }

        td:nth-child(2),
        td:nth-child(3) {
            color: #9aa0a6;
            font-size: .85rem;
            white-space: nowrap;
        }
    </style>
</head>
<body>
    <h1>Index of <?= h($uriPath) ?></h1>
    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Last Modified</th>
                <th>Size</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><a href="<?= h($parentUri) ?>">Parent Directory</a></td>
                <td></td>
                <td></td>
            </tr>
<?php foreach ($dirs as $name):
    $full = $path . DIRECTORY_SEPARATOR . $name;
    $mtime = @filemtime($full);
    $href = $uriPath . rawurlencode($name) . '/';
?>
            <tr>
                <td><a href="<?= h($href) ?>"><?= h($name) ?>/</a></td>
                <td><?= $mtime ? h(date('Y-m-d H:i', $mtime)) : '' ?></td>
                <td>-</td>
            </tr>
<?php endforeach; ?>
<?php foreach ($files as $name):
    $full = $path . DIRECTORY_SEPARATOR . $name;
    $mtime = @filemtime($full);
    $size = @filesize($full);
    $href = $uriPath . rawurlencode($name);
?>
            <tr>
                <td><a href="<?= h($href) ?>"><?= h($name) ?></a></td>
                <td><?= $mtime ? h(date('Y-m-d H:i', $mtime)) : '' ?></td>
                <td><?= $size === false ? '-' : h(format_size((int) $size)) ?></td>
            </tr>
<?php endforeach; ?>
        </tbody>
    </table>
</body>
</html>
