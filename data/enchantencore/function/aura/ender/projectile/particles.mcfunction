execute if predicate enchantencore:entity/in_ground run tag @s add ee.in_ground

particle minecraft:reverse_portal ^ ^ ^-.1 .1 .2 .1 0 3 force
particle minecraft:portal ^ ^ ^-.1 .1 .2 .1 0 3 force
execute if predicate enchantencore:percentages/20 run particle minecraft:falling_obsidian_tear ^ ^ ^-.1 .1 .2 .1 0 1 force