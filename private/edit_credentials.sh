#!/bin/bash

TARGET_DIR=/tmp/cnuapps
EDITWITH=${EDITOR:-vim}

TARGET_INSTALL_DIR=$HOME/.cnuapps/api

SOURCE_FILENAME="secrets.json"
CYPHER_OUTPUT_FILENAME="secrets.json.gpg"

has_gpg=$(which gpg)
if [[ -z "$has_gpg" ]]
then
	echo "Please install 'gpg' in order to use this tool"
	exit 1
fi

mkdir -p $TARGET_DIR
gpg --decrypt ./secrets.gpg > $TARGET_DIR/$SOURCE_FILENAME

if ! test -f "$TARGET_DIR/$SOURCE_FILENAME"
then
	echo "error occurred decrypting secrets file '$PWD/secrets.gpg'"
	exit 1
fi

MODE="$1"
INSTALL=false

case "$MODE" in
	install | -install | --install | -i | --i)
		mkdir -p $TARGET_INSTALL_DIR
		mv $TARGET_DIR/$SOURCE_FILENAME $TARGET_INSTALL_DIR
		echo "Successfully installed decrypted secrets in '$TARGET_INSTALL_DIR/$SOURCE_FILENAME'"
		exit 0
		;;
esac

$EDITWITH $TARGET_DIR/$SOURCE_FILENAME

gpg --encrypt -r juan.vallejo.12@cnu.edu $TARGET_DIR/$SOURCE_FILENAME

if ! test -f "$TARGET_DIR/$CYPHER_OUTPUT_FILENAME"
then
	echo "error occurred encrypting modified secrets file. Your changes have been preserved in $TARGET_DIR/$SOURCE_FILENAME"
fi

mv $TARGET_DIR/$CYPHER_OUTPUT_FILENAME $PWD/secrets.gpg
rm $TARGET_DIR/$SOURCE_FILENAME

echo "Successfully encrypted and saved newly updated secret data"
