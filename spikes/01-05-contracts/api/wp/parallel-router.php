<?php
// Router for a second, multi-worker PHP server used only for the rate-limit concurrency proof.
// `wp server` has one worker, so it cannot show a race.
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';
require '/tmp/wp/index.php';
