#version 330
#extension GL_ARB_separate_shader_objects : require

#include <minecraft:globals.glsl>

uniform sampler2D InSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 InSize;
};

layout(std140) uniform NightVisionConfig {
    float Gain;
    float GammaExponent;
    float NoiseAmount;
    float VignetteAmount;
    float VignetteSize;
    float TintStrength;
};

layout(location = 0) in vec2 texCoord;

layout(location = 0) out vec4 fragColor;

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(){
    vec3 color = texture(InSampler, texCoord).rgb;

    float amped = pow(clamp(luminance(color) * Gain, 0.0, 4.0), GammaExponent);
    vec3 greenTint = vec3(0.05, 1.0, 0.15) * amped;
    vec3 outColor = mix(color, greenTint, TintStrength);

    float grain = hash(texCoord * OutSize + GameTime * 97.0) - 0.5;
    outColor += grain * NoiseAmount;

    vec2 centered = texCoord - 0.5;
    float dist = length(centered) * VignetteSize;
    float vignette = 1.0 - smoothstep(0.45, 0.72, dist) * VignetteAmount;
    outColor *= vignette;

    fragColor = vec4(clamp(outColor, 0.0, 1.0), 1.0);
}
