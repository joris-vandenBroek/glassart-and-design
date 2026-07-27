<?php

// Copy this file to config.php and fill in the real values.
// config.php is git-ignored -- never commit real credentials there.

return [
    'smtp_host' => 'h64.mijn.host',
    'smtp_port' => 587,
    'smtp_username' => 'info@glassartanddesign.com',
    'smtp_password' => 'VUL_HIER_HET_ECHTE_WACHTWOORD_IN',
    'from_email' => 'info@glassartanddesign.com',
    'from_name' => 'Glassart & Design',
    'shared_secret' => 'VUL_HIER_EEN_LANGE_WILLEKEURIGE_SLEUTEL_IN',
    'allowed_origins' => [
        'https://joris-vandenbroek.github.io',
        'https://glassartanddesign.com',
    ],
];
