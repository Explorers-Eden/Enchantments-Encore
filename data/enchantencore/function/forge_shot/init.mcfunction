execute store result score $forge_shot enchantencore.technical run random value 0..3
execute if score $forge_shot enchantencore.technical matches 0 run data modify storage enchantencore:forge_shot blockstate set value {Name:"minecraft:anvil",Properties:{facing:"north"}}
execute if score $forge_shot enchantencore.technical matches 1 run data modify storage enchantencore:forge_shot blockstate set value {Name:"minecraft:anvil",Properties:{facing:"south"}}
execute if score $forge_shot enchantencore.technical matches 2 run data modify storage enchantencore:forge_shot blockstate set value {Name:"minecraft:anvil",Properties:{facing:"east"}}
execute if score $forge_shot enchantencore.technical matches 3 run data modify storage enchantencore:forge_shot blockstate set value {Name:"minecraft:anvil",Properties:{facing:"west"}}

function enchantencore:forge_shot/exec with storage enchantencore:forge_shot
