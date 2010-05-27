#!/bin/bash

export a="feedsidebar/chrome/locale/en-US/"
export b="feedsidebar/chrome/content/"
export c="feedsidebar/modules/"
echo "Unused entities:"

for dtdfile in `ls $a*.dtd` 
do
	awk '/<!ENTITY/ {print $2}' < $dtdfile | while read line
	do
		search=`grep -R "${line}" "$b"`
		if [ "$search" == "" ]
		then
			search=`grep -R "${line}" "$c"`
			if [ "$search" == "" ]
			then
				echo "${line}";
			fi
		fi
	done;
done;

echo ""
echo "Unused properties:"

for propfile in `ls $a*.properties`
do
	awk -F "=" '{if (!($2 == "")) { print $1 }}' < $propfile | while read line
	do
		search=`grep -R "${line}" "$b"`
		if [ "$search" == "" ]
		then
			search=`grep -R "${line}" "$c"`
			if [ "$search" == "" ]
			then
				echo "${line}";
			fi
		fi
	done;
done;
