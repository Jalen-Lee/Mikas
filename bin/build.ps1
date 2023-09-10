# build extension
$pwdStr = (Get-Location).Path
Write-Output $pwdStr
$env:NODE_ENV = "production"
webpack --mode production --devtool hidden-source-map

# build image-compressor
cd ./src/modules/image-compressor/webview
npm run build
$buildImageCompressor = "Copy-Item -Path ./dist/ -Destination $pwdStr/dist/image-compressor-dist/ -Recurse"
Invoke-Expression $buildImageCompressor