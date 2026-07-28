<?php

// Copy this file to config.php and fill in the real values.
// config.php is git-ignored -- never commit real credentials there.

return [
    'allowed_origins' => [
        'https://joris-vandenbroek.github.io',
        'https://glassartanddesign.com',
        'https://staging.glassartanddesign.com',
    ],
    // Shared secret the frontend sends as NEXT_PUBLIC_UPLOAD_SECRET (same pattern as
    // mail-server/config.php's shared_secret). Generate with e.g. `openssl rand -hex 32`.
    'upload_secret' => 'VUL-HIER-EEN-STERK-GEGENEREERD-GEHEIM-IN',
    // Public URL under which upload-server/uploads/kunstwerken/ is reachable over HTTPS.
    'upload_public_base_url' => 'https://VUL-HIER-DE-ECHTE-URL-IN.mijn.host/upload-server/uploads/kunstwerken',
    // Optional: only needed once the staging environment exists. A different secret,
    // routed to a separate upload directory (uploads/kunstwerken-test/) and URL so test
    // photos never mix with real production ones.
    'staging_upload_secret' => 'VUL-HIER-EEN-ANDER-STERK-GEGENEREERD-GEHEIM-IN',
    'staging_upload_public_base_url' => 'https://VUL-HIER-DE-ECHTE-URL-IN.mijn.host/upload-server/uploads/kunstwerken-test',
];
