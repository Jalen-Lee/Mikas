#!/bin/bash
rsync -avz ./assets/native-node/ ./node_modules/sharp/build/Release/
echo "libvips dependences amounted!"
patch-package