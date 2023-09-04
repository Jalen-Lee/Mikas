# build extension
pwdStr="$(pwd)"
echo "$pwdStr"
cross-env NODE_ENV=production webpack --mode production --devtool hidden-source-map

# build image-compressor
cd ./src/modules/image-compressor/webview
npm run build
buildImageCompressor="cpy ./dist/ $pwdStr/dist/image-compressor-dist/"
eval "$buildImageCompressor"