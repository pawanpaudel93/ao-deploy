-- Custom test contract with dependencies
Handlers.add("hello", "Hello", function (msg)
  msg.reply({ Data = "Hello World!" })
end)

Handlers.add("bye", "Bye", function (msg)
  msg.reply({ Data = "Bye World!" })
end)