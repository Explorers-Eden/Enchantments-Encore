#version 330
#extension GL_ARB_separate_shader_objects : require

uniform sampler2D InSampler;

layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 InSize;
};

layout(std140) uniform ColorblindConfig {
    float Mode;
    float Severity;
};

layout(location = 0) in vec2 texCoord;

layout(location = 0) out vec4 fragColor;

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main(){
    vec3 color = texture(InSampler, texCoord).rgb;
    vec3 simulated = color;

    if (Mode < 0.5) {
        simulated = vec3(
            dot(color, vec3(0.567, 0.433, 0.000)),
            dot(color, vec3(0.558, 0.442, 0.000)),
            dot(color, vec3(0.000, 0.242, 0.758))
        );
    } else if (Mode < 1.5) {
        simulated = vec3(
            dot(color, vec3(0.625, 0.375, 0.000)),
            dot(color, vec3(0.700, 0.300, 0.000)),
            dot(color, vec3(0.000, 0.300, 0.700))
        );
    } else if (Mode < 2.5) {
        simulated = vec3(
            dot(color, vec3(0.950, 0.050, 0.000)),
            dot(color, vec3(0.000, 0.433, 0.567)),
            dot(color, vec3(0.000, 0.475, 0.525))
        );
    } else {
        simulated = vec3(luminance(color));
    }

    vec3 outColor = mix(color, simulated, Severity);
    fragColor = vec4(outColor, 1.0);
}
