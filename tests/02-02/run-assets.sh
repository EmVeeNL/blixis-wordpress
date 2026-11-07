#!/bin/sh
# Runs only inside the disposable 02-01 container after its ordinary assertions.
set -eu
T0202_MODE=parent wp eval-file /tmp/t/assets.php
mkdir -p wp-content/themes/blixis-test-child/assets/build
printf '/*\nTheme Name: Test child\nTemplate: blixis-base\n*/\n' > wp-content/themes/blixis-test-child/style.css
printf '.child-shadow{color:red}\n' > wp-content/themes/blixis-test-child/assets/build/tailwind.css
wp theme activate blixis-test-child --quiet
T0202_MODE=child wp eval-file /tmp/t/assets.php
wp theme activate blixis-base --quiet
mv wp-content/themes/blixis-base/assets/build/tailwind.css /tmp/tailwind-backup.css
wp config set WP_ENVIRONMENT_TYPE production --quiet
T0202_MODE=missing wp eval-file /tmp/t/assets.php
wp config set WP_ENVIRONMENT_TYPE local --quiet
if T0202_MODE=local wp eval-file /tmp/t/assets.php > /tmp/t0202-local.out 2>&1; then
  echo 'FAIL [02-02 local] missing asset must fail request'
elif grep -q 'compiled stylesheet.*is missing' /tmp/t0202-local.out; then
  echo 'PASS [02-02 local] missing asset stops with build instruction'
else
  echo 'FAIL [02-02 local] unexpected request failure'
fi
mv /tmp/tailwind-backup.css wp-content/themes/blixis-base/assets/build/tailwind.css
