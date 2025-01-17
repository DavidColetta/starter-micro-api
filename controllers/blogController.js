const { result, indexOf } = require('lodash');
const Blog = require('../models/blog');
const User = require('../models/user');
const Tag = require('../models/tag');

const blog_index = async (req, res) => {
  var tags = await Tag.find().sort({ name: 1 });
  Blog.find().sort({ updatedAt: -1 })
    .then(result => {
      const blogs = result.filter(blog => (blog.public || (req?.user?._id == blog.createdById)));
      //Remove tags from tags if they have no public blogs
      tags = tags.filter(tag => {
        for (i = 0; i < tag.blogs.length; i++) {
          const blog = blogs.find(value => value._id == tag.blogs[i]);
          if (blog != null && (blog.public || (req?.user?._id == blog.createdById))) {
            return true;
          }
        }
        return false;
      });
      res.render('index', { tagQuery: [], tags: tags, cotags:[], blogs: blogs, title: 'All Blogs', name: req?.user?.username});
    })
    .catch(err => {
      console.log(err);
    });
}

const blog_tag_search = async (req, res) => {
  const tagStrings = req.params.tag.split(',');
  for (i = 0; i < tagStrings.length; i++) {
    tagStrings[i] = tagStrings[i].trim();
  }
  var allBlogs = await Blog.find().sort({ updatedAt: -1 });
  allBlogs = allBlogs.filter(blog => (blog.public || (req?.user?._id == blog.createdById)));
  //Remove tags from alltags if they have no public blogs
  var allTags = await Tag.find().sort({ name: 1 });
  allTags = allTags.filter(tag => {
    for (i = 0; i < tag.blogs.length; i++) {
      const blog = allBlogs.find(value => value._id == tag.blogs[i]);
      if (blog != null && (blog.public || (req?.user?._id == blog.createdById))) {
        return true;
      }
    }
    return false;
  });

  const tagObjects = allTags.filter(tag => tagStrings.includes(tag.name));
  //Order tagObjects by tagStrings
  tagObjects.sort((a, b) => {
    return indexOf(tagStrings, a.name) - indexOf(tagStrings, b.name);
  });
  var blogList = [];
  //Bloglist is the intersection of all blogs in each tag
  if (tagObjects.length > 0) {
    blogList = tagObjects[0].blogs;
    for (i = 1; i < tagObjects.length; i++) {
      blogList = blogList.filter(value => tagObjects[i].blogs.includes(value));
    }
  }
  
  //Get blogs from blogList
  const finalBlogList = allBlogs.filter(blog => blogList.includes(blog._id));
  //Cotags is the union of all tags in each blog in tagObjects[0]
  var cotags = [];
  var blogsToFetchFromDatabase = [];
  if (tagObjects.length > 0) {
    var blogs = tagObjects[0].blogs;//Blogs in first tag
    for (i = 0; i < blogs.length; i++) {
      const blog = allBlogs.find(value => value._id == blogs[i]);//Find blog in finalBlogList
      if (blog == null) {
        console.log("Blog not found!!!" + blogs[i]);
      } else {
        cotags = cotags.concat(blog.tags);//If blog in finalBlogList, add tags to cotags
      }
    }
  }
  cotags = [...new Set(cotags)];//Remove duplicates
  //cotags = cotags.filter(value => !tagStrings.includes(value));//Remove tags in tagStrings
  cotags.sort();//Sort cotags
  res.render('index', { tagQuery: tagStrings, tags: allTags, cotags: cotags, blogs: finalBlogList, title: 'Blogs', name: req?.user?.username});
}

const blog_details = (req, res) => {
  const id = req.params.id;
  Blog.findById(id)
    .then(result => {
      if (!result.public && req?.user?._id != result.createdById) {
        res.render('404', { title: 'Blog not found', name: req?.user?.username });
        return;
      }
      res.render('details', { blog: result, title: 'Blog Details', name: req?.user?.username, user_id: req?.user?._id });
    })
    .catch(err => {
      console.log(err);
      res.render('404', { title: 'Blog not found', name: req?.user?.username });
    });
}

const blog_create_get = (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  Tag.find().then(result => {
    res.render('create', { title: 'Create a new blog', name: req?.user?.username, tags: result });
  });
  
}

const blog_create_post = (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  const blog = new Blog({title: req.body.title, body: req.body.body, createdBy: req.user.username, public: req.body.public != null, createdById: req.user._id, tags: []});
  //Save blog to user
  User.findById(req.user._id).then(user => {
    user.blogs.push(blog._id);
    user.save().catch(err => {
      console.log(err);
    });
  });
  //Save blog to tags
  const tags = req.body.tags_combined.split(',');
  for (var element in req.body) {
    if (element.startsWith('tag_')) {
      tags.push(element.substring(4));
    }
  };

  tags.forEach(element => {
    var tag = element.trim();
    if (tag.length > 0) {
      blog.tags.push(tag);
      Tag.findOne({name: tag}).then( result => {
        if (result == null) {
          const newtag = new Tag({name: tag, blogs: [blog._id]});
          newtag.save().catch(err => {
            console.log(err);
          });
        } else {
          result.blogs.push(blog._id);
          result.save().catch(err => {
            console.log(err);
          });
        }
      })
    }
  });

  //Save blog
  blog.save()
    .then(result => {
      res.redirect('/blogs');
    })
    .catch(err => {
      console.log(err);
    });
}

const blog_edit = (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  const id = req.params.id;
  Blog.findById(id)
    .then(result => {
      if (result.createdById == null || req.user._id == result.createdById) {
        Tag.find().sort({ name: 1 }).then(tags => {
          res.render('editdetails', { blog: result, tags: tags, title: 'Edit Blog Details', name: req?.user?.username })
        }).catch(err => {
          console.log(err);
        });
      } else {
        res.redirect('/blogs/'+id);
      }
    })
    .catch(err => {
      console.log(err);
      res.render('404', { title: 'Blog not found', name: req?.user?.username });
    });
}

const blog_edit_post = (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  const id = req.params.id;

  Blog.findById(id)
    .then(blog => {
      if (req.user._id != blog.createdById && blog.createdById != null) {
        res.redirect('/blogs/'+id);
        return;
      }
      if (blog.createdById == null) {
        blog.createdById = req.user._id;
        blog.createdBy = req.user.username;

        User.findById(req.user._id).then(user => {
          user.blogs.push(blog._id);
          user.save().catch(err => {
            console.log(err);
          });
        });
      }
      blog.title = req.body.title;
      blog.body = req.body.body;
      blog.public = req.body.public != null;
      const tags = req.body.tags_combined.split(',');
      for (var element in req.body) {
        if (element.startsWith('tag_')) {
          tags.push(element.substring(4));
        }
      };
      //trim tags
      for (i = 0; i < tags.length; i++) {
        tags[i] = tags[i].trim();
      }

      //Delete from tags
      for (i = 0; i < blog.tags.length; i++) {
        Tag.findOne({name: blog.tags[i]}).then( tag => {
          if (tag != null) {
            if (indexOf(tags, tag.name) == -1) {//If tag not in new tags
              tag.blogs.pull(blog._id);
              if (tag.blogs.length == 0) {
                tag.delete();
              } else {
                tag.save().catch(err => {
                  console.log(err);
                });
              }
            }
          }
        });
      }

      //Add to tags
      blog.tags = [];
      tags.forEach(element => {
        if (element.length > 0) {
          blog.tags.push(element);
          Tag.findOne({name: element}).then( tag => {
            if (tag == null) {
              const newtag = new Tag({name: element, blogs: [blog._id]});
              newtag.save().catch(err => {
                console.log(err);
              });
            } else {
              if (!tag.blogs.includes(blog._id)) {//If blog not already in tag
                tag.blogs.push(blog._id);
                tag.save().catch(err => {
                  console.log(err);
                });
              }
            }
          })
        }
      });
      
      blog.save()
        .then(result => {
          res.redirect('/blogs/'+id);
        })
        .catch(err => {
          console.log(err);
        });
    })
    .catch(err => {
      console.log(err);
      res.render('404', { title: 'Blog not found', name: req?.user?.username });
    });
}

const blog_delete = (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  const id = req.params.id;
  Blog.findById(id)
    .then(result => {
      if (result.createdById == null || req.user._id == result.createdById) {//Execute Delete
        //Delete from tags
        for (i = 0; i < result.tags.length; i++) {
          Tag.findOne({name: result.tags[i]}).then( tag => {
            if (tag != null) {
              tag.blogs.pull(result._id);
              if (tag.blogs.length == 0) {
                tag.delete();
              } else {
                tag.save().catch(err => {
                  console.log(err);
                });
              }
            }
          });
        }
        //Delete from blogs
        Blog.findByIdAndDelete(id)
          .then(result => {
            res.json({ redirect: '/blogs' });
          })
          .catch(err => {
            console.log(err);
          });
      } else
        res.redirect('/blogs/'+id);
    })
    .catch(err => {
      console.log(err);
      res.render('404', { title: 'Blog not found', name: req?.user?.username });
    });
}

module.exports = {
  blog_index, 
  blog_details, 
  blog_create_get, 
  blog_create_post, 
  blog_tag_search,
  blog_edit,
  blog_edit_post,
  blog_delete
}