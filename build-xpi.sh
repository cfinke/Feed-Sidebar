rm -rf .tmp_xpi_dir/

chmod -R 0777 feedsidebar/

mkdir .tmp_xpi_dir/
cp -r feedsidebar/* .tmp_xpi_dir/

rm -rf `find ./.tmp_xpi_dir/ -name ".DS_Store"`
rm -rf `find ./.tmp_xpi_dir/ -name "Thumbs.db"`
rm -rf `find ./.tmp_xpi_dir/ -name ".svn"`

cd .tmp_xpi_dir/chrome/
zip -rq ../feedsidebar.jar *
rm -rf *
mv ../feedsidebar.jar ./
cd ../
zip -rq ~/Desktop/feedsidebar.xpi *
cd ../
rm -rf .tmp_xpi_dir/
