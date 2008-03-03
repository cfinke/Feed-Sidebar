rm -rf .xpi_work_dir/
chmod -R 0777 feedsidebar/
rm -f feedsidebar.xpi
mkdir .xpi_work_dir
cp -r feedsidebar/* .xpi_work_dir/
cd .xpi_work_dir/
rm -rf `find . -name ".svn"`
rm -rf `find . -name ".DS_Store"`
rm -rf `find . -name "Thumbs.db"`
zip -rq ../feedsidebar.xpi *
cd ..
rm -rf .xpi_work_dir/
cp feedsidebar.xpi ~/Desktop/
