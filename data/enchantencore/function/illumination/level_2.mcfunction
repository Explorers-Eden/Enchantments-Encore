execute at @s anchored eyes align xyz positioned ^ ^ ^ unless entity @e[type=area_effect_cloud,tag=ee.illumination,distance=..0.5] run summon area_effect_cloud ^ ^ ^ {Duration:5,Tags:["ee.illumination"],Particle:{type:"block",block_state:"minecraft:air"}}
execute at @s anchored eyes align xyz positioned ^ ^ ^ if entity @e[type=area_effect_cloud,tag=ee.illumination,distance=..0.5] unless entity @e[type=marker,tag=ee.illumination,distance=..0.5] run summon marker ^ ^ ^ {Tags:["ee.illumination"]}
execute at @s anchored eyes align xyz positioned ^ ^ ^ if entity @e[type=area_effect_cloud,tag=ee.illumination,distance=..0.5] if entity @e[type=marker,tag=ee.illumination,distance=..0.5] if block ^ ^ ^ #minecraft:air run setblock ^ ^ ^ light[level=10,waterlogged=false]