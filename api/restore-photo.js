export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: 'imageBase64 and mimeType are required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
  }

  // ============================================================
  // [HIDDEN RESTORATION PROMPT] - இது எப்போதும் server-side மட்டும்
  // இருக்கும், browser-க்கு ஒருபோதும் அனுப்பப்படாது. இதுதான் MEERA'S
  // DIGITAL-oda "secret sauce" - customer-க்கு prompt theriyaathu.
  // ============================================================
  const RESTORATION_PROMPT = `Enhance in High Resolution the portrait while strictly preserving the subject's identity with accurate facial geometry. Do not change their expression or face shape. Only allow subtle feature cleanup without altering who they are.
The image must be recreated as if it was shot on a Sony A1, cinematic shallow depth of field, perfect facial focus, and an editorial-neutral color profile.
This Sony A1 + 85mm f1.4 setup is mandatory. The final image must clearly look like premium full-frame Sony A1 quality.
Lighting must match the exact direction, angle, and mood of the reference photo. Upgrade the lighting into a cinematic, subject-focused style: soft directional light, warm highlights, cool shadows, deeper contrast, expanded dynamic range, micro-contrast boost, smooth gradations, and zero harsh shadows.
Maintain neutral premium color tone, cinematic contrast curve, natural saturation, real skin texture (not plastic), and subtle film grain. No fake glow, no runway lighting, no oversmoothing.
Render in 4K resolution, 10-bit color, cinematic editorial style, premium clarity, portrait crop, and keep the original environmental vibe untouched.
Re-render the subject with improved realism, depth, texture, and lighting while keeping identity and background fully preserved.
Color: Neutral, premium color profile with a cinematic contrast curve, natural saturation, and zero "fake glow."
Immaculate Wedding-Restoration & Colorization:
Aesthetic: Flawless "wedding album immaculate" skin.
Skin: Achieve a perfectly smooth and even skin complexion by removing all noise, grains, blemishes, sallow tones, and physical imperfections.
Texture: Critically, this smoothness must still contain minimal, perfectly clean, realistic skin micro-pores and subtle film grain - it must not look like plastic or oversmoothed CGI. A clean, polished, healthy glow.
Marks: (Handle with extreme care) If moles/birthmarks are present in the original, they must be preserved and correctly colorized, not smoothed away.
Colorization Logic: Apply realistic, natural color tones based on traditional South Asian palettes.
Dress Restoration: Completely remove all stains, dirt, dust, scratches, tears, and damage from the outfit. Make the fabric look brand-new, freshly ironed, and neatly tailored. Strictly preserve the exact original fabric pattern, cut, texture, and design. Colorize it vibrantly.
Accessories: Colorize any jewelry to accurate gold tones and the bindi to a deep, precise red, matching original position and size perfectly.
Hair: Colorize the hair to a natural dark black-brown.
Damage Removal & Seamless Extension:
Fix: Meticulously remove all physical damage (cracks, tears, dust, scratches) from the entire photo.
Background: Colorize the original background composition without changing its elements or composition, maintaining a shallow depth.
Extension: Do not zoom, crop, or move the face. Fill any existing blank area only with a realistic, seamless continuation of the body and the exact same dress visible in the image. Maintain the same clothing style, folds, draping, skin tone, lighting, and studio portrait appearance.
Maintain 100% identical to the original photograph: face shape, facial geometry, facial proportions, eyes, eye size, eye shape, eye spacing, eyelids, eyelashes, eyebrows, nose, nostrils, lips, mouth, teeth (if visible), ears, cheeks, chin, jawline, forehead, hairline, hairstyle, hair direction, hair volume (do NOT add extra hair), expression, age, skin texture, wrinkles, facial asymmetry, and every unique facial characteristic.
Don't change size, background, dress, and pose. Full high sharp result. Correct all skin tone and lighting to look natural and consistent.`;

  // [மாடல் பெயர்கள்]: gemini-3.1-flash-image ("Nano Banana") தற்போதைய (2026) Gemini
  // image generation/editing மாடல். Imagen மாடல்கள் deprecated ஆகிவிட்டன.
  const MODEL_NAMES = ['gemini-2.5-flash'];

  let lastError = null;

  for (const modelName of MODEL_NAMES) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
                { text: RESTORATION_PROMPT }
              ]
            }
          ],
          generationConfig: {
            responseModalities: ['IMAGE']
          }
        })
      });

      const data = await geminiRes.json();

      if (!geminiRes.ok) {
        console.error(`Gemini Image API Error (${modelName}):`, data);
        lastError = data.error?.message || 'API error';
        continue;
      }

      const parts = data.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(p => p.inlineData || p.inline_data);
      const inline = imagePart?.inlineData || imagePart?.inline_data;

      if (!inline?.data) {
        lastError = 'No image returned by model';
        continue;
      }

      return res.status(200).json({
        imageBase64: inline.data,
        mimeType: inline.mimeType || inline.mime_type || 'image/png'
      });
    } catch (error) {
      console.error(`Server error (${modelName}):`, error);
      lastError = error.message;
    }
  }

  return res.status(500).json({ error: lastError || 'Restoration failed' });
}
