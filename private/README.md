Securely stored server credentials
==================================

We'll use symmetric key encryption to check in cypher text containing
all secret usernames, passwords, and other related information that
the API server needs in order to send emails, access its own API as
a particular user, and access the database.

## Update encrypted credentials

To update credentials, you MUST have the admin private key shared with
you as part of new project maintainer onboarding.
If you do not yet have a copy of the private key, please contact your
system administrator.

### Import private key

Grab the private key from the Pizza My Mind admin instructions document shared with you.
The key is base64-encoded. Copy the key to your clipboard, then use the following command to decode and save the key onto a file named `private.key`:

```
$ pbpaste | base64 --decode > private.key
```

The above command assumes you have `pbpaste` available on a Mac. If on Linux, use `xsel` or `xclip` to access your clipboard contents.

Once you have the private key's binary contents saved to the file `private.key`, import it using the following command:

```
$ gpg --import private.key
```

You should now be able to use this key to edit encrypted API auth secrets.

### Install encrypted API secrets

All auth information is checked into this repo under `private/secrets.gpg`.
To install this config file under `~/.cnuapps/api/secrets.json` (location where the API server automatically expects this file to exist at runtime), use the `edit_credentials.sh` utility provided within the `private` directory:

```
# make sure to change the current directory to "private" first
$ cd ./private
$ ./edit_credentials.sh --install
Successfully installed decrypted secrets in '/home/$USER/.cnuapps/api/secrets.json'
```

### Run the API server

After following the above instructions, you should now be able to successfully run the API server locally with `node .` from the root of this repository.

### Edit the encrypted API secrets file

To actually make changes to the encrypted credentials `secrets.gpg` file, simply use the same utility as the previous step without any flags:

```
$ cd ./private
$ ./edit_credentials.sh
```

This will open up your default editor and allow you to edit a decrypted version of the credentials file. Upon saving your changes and exiting your editor, updated file contents will be re-encrypted and stored in an updated version of the `secrets.gpg` file. It should now be safe to check in and commit this file.
