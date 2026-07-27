<?php

// Copy this file to config.php and fill in the real values.
// config.php is git-ignored -- never commit real credentials there.

return [
    'allowed_origins' => [
        'https://joris-vandenbroek.github.io',
        'https://glassartanddesign.com',
        'https://staging.glassartanddesign.com',
    ],
    'firebase_project_id' => 'glassart-and-design',
    // Public URL under which upload-server/uploads/kunstwerken/ is reachable over HTTPS.
    'upload_public_base_url' => 'https://VUL-HIER-DE-ECHTE-URL-IN.mijn.host/upload-server/uploads/kunstwerken',
    // Optional: only needed once the staging environment exists. A token issued by this
    // Firebase project is also accepted, and its uploads are routed to a separate directory
    // (uploads/kunstwerken-test/) and URL so test photos never mix with real production ones.
    'staging_firebase_project_id' => 'glassart-and-design-staging',
    'staging_upload_public_base_url' => 'https://VUL-HIER-DE-ECHTE-URL-IN.mijn.host/upload-server/uploads/kunstwerken-test',
];
