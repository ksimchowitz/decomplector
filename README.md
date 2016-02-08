# Decomplector Awards

This scans a folder of git repos and gives you the total number of lines added or removed per person. It's used for our Rich Hickey Decomplector Of The Week award.

## Usage

1. `git clone git@github.com:compstak/decomplector`
2. `mkdir repos`
3. clone all your repos to that directory
4. `npm install`
5. `node index.js`

You can also create names.json to map email addresses to names like so:

```
{
	"stuart@compstak.com": "Stu",
	"stu@compstak.com": "Stu"
}
```

If an email address is not in the map it will just use their email address.
