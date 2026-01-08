schedule function enchantencore:anchor/remove 10t

execute as @e[type=happy_ghast] unless predicate enchantencore:entity/has_anchor_on_body run attribute @s minecraft:flying_speed modifier remove enchantencore:anchor
execute as @e[type=happy_ghast] if predicate enchantencore:entity/has_passenger run attribute @s minecraft:flying_speed modifier remove enchantencore:anchor

execute as @e[type=#enchantencore:rideable] unless predicate enchantencore:entity/has_anchor_on_saddle run attribute @s minecraft:movement_speed modifier remove enchantencore:anchor
execute as @e[type=#enchantencore:rideable] if predicate enchantencore:entity/has_passenger run attribute @s minecraft:movement_speed modifier remove enchantencore:anchor