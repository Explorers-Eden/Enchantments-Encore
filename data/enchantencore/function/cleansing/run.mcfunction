execute unless predicate enchantencore:entity/raises_plain_shield run effect clear @s
execute unless predicate enchantencore:entity/raises_plain_shield if predicate enchantencore:percentages/30 run particle minecraft:wax_on ~ ~.5 ~ .5 .5 .5 .5 1

scoreboard players reset @s enchantencore.cleansing
