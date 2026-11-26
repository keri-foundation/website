#!/bin/bash
set -euo pipefail

# Serve this checkout with the macOS Apache (mod_rewrite, AllowOverride All) so
# the site-root and v/ .htaccess rules can be tried before a deploy:
#
#   scripts/serve-local.sh start
#   SITE_URL=http://127.0.0.1:8099 scripts/deploy-confs.sh check-redirects
#   open http://127.0.0.1:8099/v/
#   scripts/serve-local.sh stop
#
# No PHP: index.php listings and WordPress pages are served as plain files.
# LiteSpeed on Hostinger mostly follows the same rules, but check-redirects
# against the live site after deploy is the real test.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-8099}"
RUN_DIR="${TMPDIR:-/tmp}/kerifoundation-httpd"
CONF="$RUN_DIR/httpd.conf"
MODULES=/usr/libexec/apache2

write_conf() {
    mkdir -p "$RUN_DIR"
    cat >"$CONF" <<EOF
ServerRoot "/usr"
Listen 127.0.0.1:$PORT
ServerName 127.0.0.1:$PORT
LoadModule mpm_prefork_module $MODULES/mod_mpm_prefork.so
LoadModule authz_core_module $MODULES/mod_authz_core.so
LoadModule unixd_module $MODULES/mod_unixd.so
LoadModule dir_module $MODULES/mod_dir.so
LoadModule mime_module $MODULES/mod_mime.so
LoadModule rewrite_module $MODULES/mod_rewrite.so
LoadModule headers_module $MODULES/mod_headers.so
LoadModule setenvif_module $MODULES/mod_setenvif.so
LoadModule log_config_module $MODULES/mod_log_config.so
PidFile "$RUN_DIR/httpd.pid"
ErrorLog "$RUN_DIR/error.log"
LogFormat "%h \"%r\" %>s %{Location}o" short
CustomLog "$RUN_DIR/access.log" short
TypesConfig /private/etc/apache2/mime.types
DocumentRoot "$SITE_ROOT"
<Directory "$SITE_ROOT">
    Options FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>
EOF
}

case "${1:-}" in
    start)
        write_conf
        httpd -f "$CONF" -t
        httpd -f "$CONF" -k start
        echo "Serving $SITE_ROOT at http://127.0.0.1:$PORT/  (logs: $RUN_DIR)"
        ;;
    stop)
        [ -f "$CONF" ] && httpd -f "$CONF" -k stop
        echo "Stopped."
        ;;
    *)
        echo "Usage: scripts/serve-local.sh start|stop   (PORT=8099 by default)" >&2
        exit 1
        ;;
esac
