uniform int uBackgroundType;
uniform float uBlur;
uniform int uDirectOutput;

void main() {
  vec3 color;
  if (uBackgroundType == 0) {
    color = sRGBToLinear(texture2D(uTexture0, vTexCoord).rgb);
  } else {
    vec3 dir = uIblTransform * vec3(vTexCoord.xy * 2.0 - 1.0, -1.0);
    dir = normalize(dir);
    if (uBackgroundType == 1) {
      color = texturePanoramaLod(dir, uBlur * uBlur);
    } else {
      color = sphericalHarmonics(dir);
    }
  }
  // XR VR draws background straight to the headset layer (no RGBM merge pass).
  if (uDirectOutput == 1)
    gl_FragColor = vec4(linearTosRGB(color), 1.0);
  else
    gl_FragColor = encodeRGBM(color);
}
