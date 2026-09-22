# 绘小宙 Huezumi 品牌插画

> 历史资料：插画与指针生成过程，归档于 2026-09-22。按时间保留旧提示词与资源名称；“当前”“本机”“本任务”均指原记录时点，工具原始输出不随仓库分发。当前使用说明见 [品牌资源](../brand-art.md)。

英文品牌名为 **Huezumi**，网页统一使用中文名「绘小宙」，包括导航字标、登录文案与站点标题。现有插画资源路径保留，历史生成提示词不回写。

## 箭头第三版（当前）

资源：`public/cursors/coral-arrow-v3.png`，40×40 透明画布内的有效箭头约 12×22 像素，热点 (14,8)。根据反馈改为直立短款、实心珊瑚红，深棕边配浅色外轮廓，去掉星星。替代第二版，手形不变。使用内置 imagegen 生成，sips 等比缩小。

```text
Create ONE production desktop mouse ARROW cursor icon, genuine transparent background, square canvas. IMPORTANT geometry: compact upright classic system arrow, pointing almost straight up with only a slight LEFT lean, NOT diagonally sideways. Shape like the standard Windows cursor: left edge nearly vertical; height to width ratio of arrow about 1.45; broad short head, very short stout stem, compact not elongated. Top click tip at x=30% y=16%; left bottom corner x=30% y=68%; notch x=44% y=57%; short stem ends x=55% y=77%; right edge of head around x=68% y=52%. Simple SOLID SATURATED CORAL RED fill #D84F3C, thin dark warm brown contour plus a crisp thin ivory outer keyline for contrast on both light and dark backgrounds. One tiny cream highlight only, no large white fill. NO star or other decorations, no separate shapes. Flat clear icon designed for visibility at 32px, no gradients, shadows, 3D, texture, face, words, border or background. NO blue or purple. Balanced compact classic pointer proportions and high contrast are the priority.
```

## 箭头第二版

根据视觉反馈，当前普通指针改用 `public/cursors/star-arrow-v2.png`，32×32，热点 (7,4)。去掉厚重深棕描边，使用细珊瑚轮廓、奶油白与小星星。手形保持不变；第一版图片保留作历史资源。使用内置 imagegen 生成，sips 仅等比缩小。

```text
Create one elegant production mouse ARROW cursor icon with real transparent alpha background on a square canvas. This is a tiny UI cursor, not a large sticker illustration. Classic slender north-west pointing arrow silhouette, sharp precise tip, straight edges, narrow short stem. Ivory white fill with a SINGLE fine muted terracotta outline, no thick brown outline and no multiple nested borders. A very subtle pale peach accent along one edge only. One tiny butter-yellow four-point sparkle beside lower-right tail, at most 12 percent of arrow height, outlined finely. Airy, refined, gentle cute Japanese stationery design. Flat colors, no gradients, no shadow, no texture, no 3D, no face, no words, no border or backdrop. NO blue or purple. Whole arrow including sparkle occupies 75 percent of canvas height, upper-left tip at approximately x=20 percent and y=12 percent, lower end around x=72 percent y=85 percent. Arrow head should be narrow like a standard desktop pointer, NOT a broad triangle. Designed to remain crisp and graceful at 32 pixels. Genuine transparent background, no painted checkerboard.
```

## 自定义鼠标指针

使用内置 imagegen 生成透明 PNG，再用 sips 等比缩小到 40×40；不使用鼠标跟踪脚本。资源为 `public/cursors/star-arrow.png`（热点 6,4）与 `public/cursors/planet-hand.png`（热点 17,5）。仅对支持悬停的精细指针设备启用，强制颜色模式及资源失败保留原生后备，文本输入与禁用状态保持原生语义。

### 星星箭头提示词

```text
Generate a production raster mouse cursor icon, single icon only, square 1024 canvas with a genuinely TRANSPARENT alpha background. An unmistakable classic mouse arrow pointing upper-left, sharp tip at approximately x=160 y=120, arrow extends toward lower-right to x=790 y=870. Bold simple silhouette, ivory fill, thick warm dark brown outline with thin white outer keyline for contrast on dark and light UI, coral inner accent. A tiny simple butter-yellow four-point sparkle attached to the lower-right tail, not near the tip. Cute warm Japanese stationery aesthetic for 绘小宙. Flat pixel-legible vector-like raster design, no texture, no shadow, no gradients, no face, no words. Must remain readable scaled to 32x32 px. NO blue, purple, cyan. No backdrop, no checkerboard painted into the image. Entire icon visible and ample transparent margin. The top-left arrow tip is the click hotspot.
```

### 星球手形提示词

```text
Generate a single cute production raster POINTER mouse cursor icon on a genuinely transparent alpha background. Square canvas, full icon centered with transparent margin. Classic hand pointer with ONE raised index finger pointing upward, ivory glove silhouette, bold warm dark-brown outline plus thin white outer keyline for both dark and light backgrounds. A tiny simple coral ringed planet symbol on the wrist, not touching raised fingertip. Small rounded glove fingers, clear iconic pointer shape, very simple flat vector-like raster art readable at 32x32 pixels. Raised fingertip around x=45% y=12% is click hotspot. Palette ivory, coral, butter yellow, brown only, NO blue or purple. No face, letters, texture, shading, motion trails, additional floating objects, UI or watermark. No background, no painted checkerboard. Designed to match a warm cream and coral star-arrow cursor.
```

## 多题材创意卡片

使用内置 imagegen 分别生成，WebP 仅做格式压缩，保留原始构图。四张分别覆盖科技、日常、二次元、现实，人物、表情、场景及表现手法不重复；首页标注为 AI 创意示意图。原首页主视觉保留。

### tech

资源：`public/images/huixiaozhou-tech.webp`

```text
Create ONE landscape 4:3 high quality editorial concept image for a creative website category TECHNOLOGY. A charming retro-futuristic ivory and coral delivery robot with small amber eye lights tends tiny plants in a sunlit orbital greenhouse, huge circular window shows an apricot planet, elegant cream architecture and sage foliage, tactile brushed metal, warm golden light. Sophisticated cinematic 3D render, playful optimistic science fiction, crisp detailed foreground robot, beautiful atmospheric depth, not anime illustration. No human, no cats. Clear composition readable in a small web card. Strict warm ivory, coral, peach, gold, sage palette. NO blue, purple, cyan or violet. No text, letters, logos, watermark, border, or UI.
```

### daily

资源：`public/images/huixiaozhou-daily.webp`

```text
Create ONE landscape 4:3 illustration for a creative website category EVERYDAY LIFE. Delightful modern gouache editorial illustration, playful flat shapes, visible paper texture, sophisticated picture-book composition, NOT anime and NOT photoreal. A young adult woman with dark curly bob hair, round coral glasses, cream shirt and sage apron laughs joyfully with eyes squeezed shut while kneading dough in her small sunny apartment kitchen. An excited small brown dachshund watches from a stool, flour puff in warm air, oranges, peach gingham towel, leafy houseplants and open window. Character and laughing expression clearly visible, medium wide composition with subject near center. Palette warm cream, peach, coral, mustard, olive and brown, NO blue, purple, cyan or violet anywhere. No text, logos, watermarks, frame or UI. Charming real everyday moment, no planets, no fantasy, no cats.
```

### anime

资源：`public/images/huixiaozhou-anime.webp`

```text
Use case: illustration-story. Create a single original 4:3 landscape illustration for a playful creative website. Polished Japanese anime storybook art, delicate brown linework, warm watercolor paper texture and gentle cel shading. Palette exclusively cream, peach, coral, butter yellow, sage green, warm brown. Absolutely NO blue, purple, violet, indigo, cyan or lavender. Subject: a young adult male fox-eared cartographer with tousled copper hair, freckles, amber eyes, sage adventurer coat and a coral scarf. Expression: surprised and curious, wide eyes and slightly open mouth as a tiny golden moth lands on his nose. He holds an unfolded blank old map inside an enormous hollow tree library, hanging lanterns and rounded bookshelves, mushroom stools and foliage. Medium waist-up composition, expressive face prominent and entirely visible in center 70%. No girl, no cat, no floating planet. Distinct character portrait, charming but not childish. No text, letters, UI, watermark or framing. Full-bleed landscape artwork.
```

### real

资源：`public/images/huixiaozhou-real.webp`

```text
Use case: photorealistic-natural. Create ONE landscape 4:3 authentic cinematic editorial photograph for a creative website category REAL LIFE. An elderly East Asian male ceramic artisan with short silver hair, fine wrinkles, dark olive linen shirt and clay-stained tan apron quietly concentrates on shaping a terracotta bowl on a pottery wheel. Expression: focused, thoughtful, lips relaxed, gaze down at the bowl, NOT smiling. Beautiful believable hands, naturally candid medium-wide framing, face and pottery both prominent in center 75%. Real rustic pottery studio, shelves of earthen vessels, warm late afternoon window light, dust particles, subdued terracotta, cream, olive and brown palette. Documentary photography, realistic skin texture, subtle 35mm film grain and soft depth of field. NOT anime, NOT illustration, NOT 3D. No blue, purple, violet or cyan anywhere. No readable text, logos, UI, border or watermark. Fictional person, original scene.
```

首页资源：`public/images/huixiaozhou-universe.png`。使用内置 imagegen 生成，未使用 CLI 或新增运行时依赖。图片为品牌概念示意，不是用户作品或平台生成质量承诺。标识为独立 SVG：`public/favicon.svg`。

## 最终生成提示词

```text
Use case: illustration-story. Asset type: original anime illustration for a warm playful Chinese creative website 绘小宙, about creating your own little universe through stories, characters, pictures and videos. Create a beautiful polished hand-drawn anime illustration: a cheerful young adult female illustrator with short chestnut hair, coral ribbon and cozy ivory outfit sits on a tiny floating grassy planet, holding a sketchbook and pencil, accompanied by a small round cream cat mascot. Around them float little warm paper story pages, tiny stars, an apricot ringed planet, fluffy cream clouds and miniature peach-roof houses. Color palette strictly warm cream, peach, coral pink, butter yellow, soft sage green, brown outlines. Absolutely NO blue, purple, violet, indigo, cyan or lavender anywhere. Background pale butter cream with airy negative space. Elegant delicate linework, soft cel shading, joyful Japanese slice-of-life anime art, whimsical miniature world, carefully composed landscape 3:2 image, character centered with scene around her. No text, logos, watermark or UI. Not a website screenshot.
```

## 首屏可切换风格（2026-09-19）

使用内置 imagegen 分别生成，cwebp 以质量 86 压缩格式，原图保留在工具输出目录。保留原二次元图，新增以下资源，均为概念示意。

### clay

资源：`public/images/hero-clay.webp`

```text
Use case: illustration-story. Generate one square full bleed hero artwork for a playful Chinese creative platform about creating your own little universe. Distinct tactile stop-motion clay miniature style, handmade felt and clay textures, not anime. A cheerful small cream rabbit postmaster with coral scarf stands next to a rounded peach postal spaceship on a tiny grassy floating planet, holding an envelope, miniature houses and flowers, floating cream clouds and apricot ringed planet. Central character occupies middle 60%, keep face clear of top corners and bottom 15% where UI stickers will sit; arch cropping must preserve character. Warm cream, coral, butter yellow, sage and brown palette, no blue or purple. Beautiful soft studio light, whimsical highly detailed handcrafted diorama. No text, lettering, logos, UI, borders or watermark.
```

### watercolor

资源：`public/images/hero-watercolor.webp`

```text
Use case: illustration-story. Generate one square full bleed hero artwork for a playful creative platform about creating your own little universe. Distinct traditional watercolor children's storybook painting with translucent pigments, fine brown ink and textured ivory paper, not glossy anime, not 3D. A young adult traveler with curly auburn hair, sage overalls and round glasses tends a tiny floating island tea garden with a capybara friend; giant flowers, a peach-roof teahouse, hanging lanterns and winding stairs among fluffy clouds. Gentle curious expression. Central figure in middle 60%, face clear of top corners and bottom 15% for UI stickers, composable into an arch. Airy warm cream, peach, coral, butter yellow, muted sage and brown only, no blue or purple. Enchanting detailed composition. No text, lettering, logos, UI, border or watermark.
```

### paper

资源：`public/images/hero-paper.webp`

```text
Use case: illustration-story. Generate one square full bleed hero artwork for a playful creative platform about creating your own little universe. Distinct exquisite layered paper-cut craft illustration with visible cut paper edges, folded forms, soft depth shadows, bold simple silhouettes; not anime or watercolor. A friendly coral fox explorer holding a tiny star lantern sails a cream folded-paper boat through clouds around a miniature floating city of peach houses, sage trees and a butter-yellow crescent moon. Central fox and boat in middle 60%, keep subject away from top corners and bottom 15% for UI stickers, suitable for arch crop. Sophisticated charming handmade picture book craft, warm ivory, coral, peach, butter yellow, sage and brown palette only, no blue or purple. No text, letters, logos, border, UI or watermark.
```

## 多色卡片与箭头（2026-09-19）

内置 imagegen 生成三张新场景及两个独立透明箭头。角色参考来自用户提供的三视图，仅用于生成，不复制到公开目录。场景 cwebp 压缩，箭头 sips 等比缩小到 192px，保留 alpha。用户的新要求优先于此前统一暖色的约束。

### pink

资源：`public/images/hero-pink.webp`

```text
Use case illustration-story. Use attached image as CHARACTER REFERENCE only. Generate ONE square polished anime scene featuring the SAME girl: silver white high ponytail, pink bow, pink eyes, white oversized jacket with pink trim and ribbons, white collared shirt heart detail, charcoal pleated skirt, white pink sneakers. Wholesome fully clothed cheerful pose standing on a floating transparent platform in a futuristic cherry blossom city, she holds a glowing pink star in both hands. Preserve hairstyle, face and outfit identity; single character, no character sheet. Cool pearl white, candy pink, lilac and icy blue palette, NO yellow/sepia/orange color wash. Crisp contemporary anime illustration, sparkling translucent architecture, clouds, petals. Subject centered and fully visible within middle 70%, generous surrounding scene, square artwork for a collectible card. No text, logos, UI or border.
```

### ocean

资源：`public/images/hero-ocean.webp`

```text
Use case illustration-story. One square spectacular miniature 3D glass-and-clay ocean universe, adorable small white astronaut with reflective teal visor rides a translucent turquoise manta ray above tiny white seaside observatory islands, coral pink anemones and crystalline bubbles, flowing midnight cobalt water and cyan bioluminescent trails. Distinct cool saturated cobalt blue, turquoise, mint and pearl white palette. NO cream yellow sepia warm wash. Tactile high quality 3D art, joyful adventurous cinematic lighting, central main character in middle 65%, square collectible card illustration, rich depth. No text, logos, UI, border.
```

### forest

资源：`public/images/hero-forest.webp`

```text
Use case illustration-story. One square lush emerald and mint gouache storybook painting: a tiny red panda botanist in white overalls explores a giant fern forest with a lavender mushroom cottage and a stream, carrying a transparent terrarium backpack. Playful flat hand painted shapes, expressive charming face, visible brush texture. Saturated emerald green, jade, cool mint, lavender and white palette, small red panda rust accent only. NO yellow sepia cream wash. Distinct flat graphic gouache style, central subject middle 65%, generous environment, square collectible art card. No text, logo, UI, border.
```

### arrow-left

资源：`public/images/deck-arrow-left.png`

```text
Use case product-mockup. Generate ONE large single LEFT POINTING arrow icon on a genuinely TRANSPARENT alpha background. Cute tactile puffy sticker arrow, unmistakable thick curved shaft and triangular arrowhead pointing left, glossy pearl white fill with saturated pink edge and dark plum fine outline, tiny lavender sparkle attached near tail. Strong silhouette, nearly fills square canvas with 12% clear margin, designed legible at 64px, no circle or tile behind it, no text, letters, watermark, checkerboard or backdrop. A clean polished 3D stationery sticker, front facing, transparent PNG.
```

### arrow-right

资源：`public/images/deck-arrow-right.png`

```text
Use case product-mockup. Generate ONE large single RIGHT POINTING arrow icon on a genuinely TRANSPARENT alpha background. Cute tactile puffy sticker arrow, unmistakable thick curved shaft and triangular arrowhead pointing right, glossy pearl white fill with saturated pink edge and dark plum fine outline, tiny lavender sparkle attached near tail. Strong silhouette, nearly fills square canvas with 12% clear margin, designed legible at 64px, no circle or tile behind it, no text, letters, watermark, checkerboard or backdrop. A clean polished 3D stationery sticker, front facing, transparent PNG.
```

### 手绘侧边箭头 v2

使用内置 imagegen 分别生成左右两个独立资产，保留透明通道，缩至 192px：`public/images/deck-arrow-left-v2.png`、`public/images/deck-arrow-right-v2.png`。替换厚重糖果箭头，位于卡片堆两侧。

提示词（分别将 direction 设为 left / right）：

> Use case: stylized-concept. Asset: a single direction-pointing navigation arrow for a delicate cream and terracotta anime storybook website. Transparent background with real alpha. A slender gently curved hand-drawn arrow, terracotta coral ink #c65343 with subtle pale peach watercolor edge, open chevron head pointing direction, slightly imperfect brush stroke. Flat elegant doodle, airy, friendly, understated. Center in square image, arrow fills 80% width. No button container, no text, no extra symbols, no shadow, no glossy 3D, no bubble shape, no purple or hot pink.

原始文件：`exec-0e59de27-e87c-4bf8-9ddf-9f14abcd2c07.png`（左）、`exec-7c611fd5-6e4f-475e-bb70-f2b3ce907fce.png`（右），位于本任务默认 imagegen 生成目录。
