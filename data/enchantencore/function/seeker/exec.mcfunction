execute unless entity @e[type=player,distance=..4,predicate=enchantencore:entity/has_seeker_1] run data modify entity @s Glowing set value 0b
execute unless entity @e[type=player,distance=..8,predicate=enchantencore:entity/has_seeker_2] run data modify entity @s Glowing set value 0b
execute unless entity @e[type=player,distance=..12,predicate=enchantencore:entity/has_seeker_3] run data modify entity @s Glowing set value 0b

execute if entity @e[type=player,distance=..4,predicate=enchantencore:entity/has_seeker_1] run data modify entity @s Glowing set value 1b
execute if entity @e[type=player,distance=..8,predicate=enchantencore:entity/has_seeker_2] run data modify entity @s Glowing set value 1b
execute if entity @e[type=player,distance=..12,predicate=enchantencore:entity/has_seeker_3] run data modify entity @s Glowing set value 1b