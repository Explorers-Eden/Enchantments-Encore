schedule function enchantencore:leaf_jumper/kill 5t

execute as @e[type=block_display,tag=ee.leaf_jumper] at @s unless entity @e[type=area_effect_cloud,tag=ee.leaf_jumper,distance=..0.5] unless entity @e[type=player,distance=..2.5] if block ~ ~ ~ barrier run setblock ~ ~ ~ air
execute as @e[type=block_display,tag=ee.leaf_jumper] at @s unless entity @e[type=area_effect_cloud,tag=ee.leaf_jumper,distance=..0.5] unless entity @e[type=player,distance=..2.5] run kill @s
execute as @a[scores={enchantencore.leaf_jumper=1..}] run scoreboard players set @s enchantencore.leaf_jumper 0