#!/bin/sh
set -e
# El volumen persistente de Railway se monta como root: se asegura la carpeta de archivos
# y se ejecuta la app con el usuario sin privilegios "node".
mkdir -p "${UPLOAD_DIR:-/data/uploads}"
chown -R node:node "${UPLOAD_DIR:-/data/uploads}"
exec su-exec node "$@"
