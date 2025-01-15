summon area_effect_cloud ~ ~ ~ \
{\
Particle:\
{type:"dust_color_transition",from_color:[0.024,0.004,0.510],scale:1,to_color:[0.000,0.000,0.000]},\
Radius:2f,\
RadiusPerTick:-0.015f,\
Duration:100,\
potion_contents:{custom_effects:[{id:"minecraft:blindness",amplifier:0,duration:100,show_particles:1b,show_icon:0b,ambient:1b}]}}

particle minecraft:sculk_soul ~ ~.7 ~ 1 0 1 .01 25 normal