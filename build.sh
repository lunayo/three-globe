if [ -d "build" ]; then rm -Rf build; fi
mkdir build
cp -r stylesheets build/
cp -r video build/
cp -r scripts build/
cp -r dist build/
cp -r img build/
cp index.html build/