#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

#include <minecraft:globals.glsl>

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 InSize;
};

layout(std140) uniform VoidWarpConfig {
    float AberrationAmount;
    float StaticAmount;
    float PurpleTint;
    float Speed;
};

layout(location = 0) in vec2 texCoord;

layout(location = 0) out vec4 fragColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(){
    float t = GameTime * 1200.0 * Speed;

    vec2 warpedUv = texCoord;

    vec2 aberration = (warpedUv - 0.5) * AberrationAmount * 0.01;
    float r = texture(InSampler, clamp(warpedUv + aberration, 0.0, 1.0)).r;
    float g = texture(InSampler, clamp(warpedUv, 0.0, 1.0)).g;
    float b = texture(InSampler, clamp(warpedUv - aberration, 0.0, 1.0)).b;
    vec3 color = vec3(r, g, b);

    vec3 voidTint = vec3(0.45, 0.15, 0.65);
    color = mix(color, color * voidTint * 1.8, PurpleTint * 0.5);

    float staticSeed = hash(floor(texCoord * OutSize * 0.5) + floor(t));
    float speck = step(0.985, staticSeed);
    color += voidTint * speck * StaticAmount;

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
