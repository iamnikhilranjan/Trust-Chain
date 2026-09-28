import { recoverMessageAddress } from '../frontend/node_modules/viem/_esm/index.js';

// Get VP JWT token from command line arguments
const jwt = process.argv[2];

if (!jwt) {
  console.log(`
Usage:
  node scripts/verify_vp_offline.mjs <VP_JWT_TOKEN>

Example:
  node scripts/verify_vp_offline.mjs eyJhbGciOi...
`);
  process.exit(1);
}

try {
  // Step 1: Decode JWT payload (without needing the secret key)
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format (expected 3 parts separated by dots)');
  }

  const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
  const claims = JSON.parse(payloadJson);

  console.log('\n📦 1. Decoded VP Claims from JWT:');
  console.log(JSON.stringify(claims, null, 2));

  // Step 2: Reconstruct the exact canonical EIP-191 message
  const canonicalMessage = [
    'TrustChain Verifiable Presentation',
    '',
    `I am presenting credential #${claims.token_id} for: ${claims.purpose}`,
    `Holder: ${claims.holder_address.toLowerCase()}`,
    `This presentation expires: ${claims.exp}`,
    '',
    'By signing, I prove I control this identity.',
  ].join('\n');

  console.log('\n📝 2. Reconstructed Canonical Message:');
  console.log('---');
  console.log(canonicalMessage);
  console.log('---');

  // Step 3: Pure Math — Recover signer address from the signature & message
  const recoveredAddress = await recoverMessageAddress({
    message: canonicalMessage,
    signature: claims.holder_signature,
  });

  console.log('\n🔐 3. Cryptographic Verification:');
  console.log(`- Expected Holder Address:  ${claims.holder_address.toLowerCase()}`);
  console.log(`- Recovered Signer Address: ${recoveredAddress.toLowerCase()}`);

  const isSignatureValid = recoveredAddress.toLowerCase() === claims.holder_address.toLowerCase();
  const isNotExpired = claims.exp > Math.floor(Date.now() / 1000);

  console.log('\n📊 4. Results (Pure Offline Math):');
  console.log(`- Signature Match: ${isSignatureValid ? '✅ VALID (Matches Holder)' : '❌ INVALID'}`);
  console.log(`- Expiry Status:   ${isNotExpired ? '✅ NOT EXPIRED' : '❌ EXPIRED'}`);

  if (isSignatureValid && isNotExpired) {
    console.log('\n🎉 SUCCESS: This Verifiable Presentation is mathematically authentic and signed by the holder.\n');
  } else {
    console.log('\n⚠️ FAILED: Verification failed.\n');
  }
} catch (err) {
  console.error('\n❌ Error during verification:', err.message);
  process.exit(1);
}
